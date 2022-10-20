//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import debug from 'debug';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import _ from 'lodash';
import { sha256 } from 'multiformats/hashes/sha2';
import { CID } from 'multiformats/cid';

import * as codec from '@ipld/dag-cbor';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { GetStorageAt, getStorageValue, StorageLayout } from '@cerc-io/solidity-mapper';

import {
  BlockProgressInterface,
  DatabaseInterface,
  IndexerInterface,
  EventInterface,
  ContractInterface,
  SyncStatusInterface,
  StateInterface,
  StateKind
} from './types';
import { UNKNOWN_EVENT_NAME, JOB_KIND_CONTRACT, QUEUE_EVENT_PROCESSING, DIFF_MERGE_BATCH_SIZE } from './constants';
import { JobQueue } from './job-queue';
import { Where, QueryOptions } from './database';
import { ServerConfig } from './config';

const DEFAULT_MAX_EVENTS_BLOCK_RANGE = 1000;

const log = debug('vulcanize:indexer');
const JSONbigNative = JSONbig({ useNativeBigInt: true });

export interface ValueResult {
  value: any;
  proof?: {
    data: string;
  }
}

export interface StateStatus {
  init?: number;
  diff?: number;
  checkpoint?: number;
  // eslint-disable-next-line camelcase
  diff_staged?: number;
}

export type ResultState = {
  block: {
    cid: string;
    hash: string;
    number: number;
    timestamp: number;
    parentHash: string;
  };
  contractAddress: string;
  cid: string;
  kind: string;
  data: string;
};

export class Indexer {
  _serverConfig: ServerConfig;
  _db: DatabaseInterface;
  _ethClient: EthClient;
  _getStorageAt: GetStorageAt;
  _ethProvider: ethers.providers.BaseProvider;
  _jobQueue: JobQueue;

  _watchedContracts: { [key: string]: ContractInterface } = {};
  _stateStatusMap: { [key: string]: StateStatus } = {};

  constructor (
    serverConfig: ServerConfig,
    db: DatabaseInterface,
    ethClient: EthClient,
    ethProvider: ethers.providers.BaseProvider,
    jobQueue: JobQueue
  ) {
    this._serverConfig = serverConfig;
    this._db = db;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._jobQueue = jobQueue;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);
  }

  async fetchContracts (): Promise<void> {
    assert(this._db.getContracts);

    const contracts = await this._db.getContracts();

    this._watchedContracts = contracts.reduce((acc: { [key: string]: ContractInterface }, contract) => {
      acc[contract.address] = contract;

      return acc;
    }, {});
  }

  async getSyncStatus (): Promise<SyncStatusInterface | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.getSyncStatus(dbTx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusIndexedBlock(dbTx, blockHash, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusChainHead(dbTx, blockHash, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusCanonicalBlock(dbTx, blockHash, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getBlocks (blockFilter: { blockNumber?: number, blockHash?: string }): Promise<any> {
    assert(blockFilter.blockHash || blockFilter.blockNumber);
    const result = await this._ethClient.getBlocks(blockFilter);
    const { allEthHeaderCids: { nodes: blocks } } = result;

    if (!blocks.length) {
      try {
        const blockHashOrNumber = blockFilter.blockHash || blockFilter.blockNumber as string | number;
        await this._ethProvider.getBlock(blockHashOrNumber);
      } catch (error: any) {
        // eth_getBlockByHash will update statediff but takes some time.
        // The block is not returned immediately and an error is thrown so that it is fetched in the next job retry.
        if (error.code !== ethers.utils.Logger.errors.SERVER_ERROR) {
          throw error;
        }

        log('Block not found. Fetching block after RPC call.');
      }
    }

    return blocks;
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined> {
    return this._db.getBlockProgress(blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgressInterface>, options: FindManyOptions<BlockProgressInterface>): Promise<BlockProgressInterface[]> {
    return this._db.getBlockProgressEntities(where, options);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]> {
    return this._db.getBlocksAtHeight(height, isPruned);
  }

  async markBlocksAsPruned (blocks: BlockProgressInterface[]): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.markBlocksAsPruned(dbTx, blocks);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async updateBlockProgress (block: BlockProgressInterface, lastProcessedEventIndex: number): Promise<BlockProgressInterface> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      const updatedBlock = await this._db.updateBlockProgress(dbTx, block, lastProcessedEventIndex);
      await dbTx.commitTransaction();

      return updatedBlock;
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async getEvent (id: string): Promise<EventInterface | undefined> {
    return this._db.getEvent(id);
  }

  async saveBlockAndFetchEvents (block: DeepPartial<BlockProgressInterface>, saveBlockAndFetchEvents: (block: DeepPartial<BlockProgressInterface>) => Promise<[BlockProgressInterface, DeepPartial<EventInterface>[]]>): Promise<[BlockProgressInterface, DeepPartial<EventInterface>[]]> {
    assert(block.blockHash);

    log(`getBlockEvents: fetching from upstream server ${block.blockHash}`);
    const [blockProgress, events] = await saveBlockAndFetchEvents(block);
    log(`getBlockEvents: fetched for block: ${blockProgress.blockHash} num events: ${blockProgress.numEvents}`);

    return [blockProgress, events];
  }

  async fetchEvents (blockHash: string, parseEventNameAndArgs: (kind: string, logObj: any) => any): Promise<DeepPartial<EventInterface>[]> {
    let logsPromise: Promise<any>;

    if (this._serverConfig.filterLogs) {
      const watchedContracts = this.getWatchedContracts();
      const addresses = watchedContracts.map((watchedContract): string => {
        return watchedContract.address;
      });

      logsPromise = this._ethClient.getLogs({
        blockHash,
        addresses
      });
    } else {
      logsPromise = this._ethClient.getLogs({ blockHash });
    }

    const transactionsPromise = this._ethClient.getBlockWithTransactions({ blockHash });

    const [
      { logs },
      {
        allEthHeaderCids: {
          nodes: [
            {
              ethTransactionCidsByHeaderId: {
                nodes: transactions
              }
            }
          ]
        }
      }
    ] = await Promise.all([logsPromise, transactionsPromise]);

    const transactionMap = transactions.reduce((acc: {[key: string]: any}, transaction: {[key: string]: any}) => {
      acc[transaction.txHash] = transaction;
      return acc;
    }, {});

    const dbEvents: Array<DeepPartial<EventInterface>> = [];

    for (let li = 0; li < logs.length; li++) {
      const logObj = logs[li];
      const {
        topics,
        data,
        index: logIndex,
        cid,
        ipldBlock,
        account: {
          address
        },
        transaction: {
          hash: txHash
        },
        receiptCID,
        status
      } = logObj;

      if (status) {
        let eventName = UNKNOWN_EVENT_NAME;
        let eventInfo = {};
        const tx = transactionMap[txHash];
        const extraInfo: { [key: string]: any } = { topics, data, tx };

        const contract = ethers.utils.getAddress(address);
        const watchedContract = this.isWatchedContract(contract);

        if (watchedContract) {
          const eventDetails = parseEventNameAndArgs(watchedContract.kind, logObj);
          eventName = eventDetails.eventName;
          eventInfo = eventDetails.eventInfo;
          extraInfo.eventSignature = eventDetails.eventSignature;
        }

        dbEvents.push({
          index: logIndex,
          txHash,
          contract,
          eventName,
          eventInfo: JSONbigNative.stringify(eventInfo),
          extraInfo: JSONbigNative.stringify(extraInfo),
          proof: JSONbigNative.stringify({
            data: JSONbigNative.stringify({
              blockHash,
              receiptCID,
              log: {
                cid,
                ipldBlock
              }
            })
          })
        });
      } else {
        log(`Skipping event for receipt ${receiptCID} due to failed transaction.`);
      }
    }

    return dbEvents;
  }

  async saveBlockProgress (block: DeepPartial<BlockProgressInterface>): Promise<BlockProgressInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.saveBlockProgress(dbTx, block);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<EventInterface>> {
    return this._db.getBlockEvents(blockHash, where, queryOptions);
  }

  async getEventsByFilter (blockHash: string, contract?: string, name?: string): Promise<Array<EventInterface>> {
    // TODO: Uncomment after implementing hot reload of watched contracts in server process.
    // This doesn't affect functionality as we already have a filter condition on the contract in the query.
    // if (contract) {
    //   const watchedContract = await this.isWatchedContract(contract);
    //   if (!watchedContract) {
    //     throw new Error('Not a watched contract');
    //   }
    // }

    const where: Where = {
      eventName: [{
        value: UNKNOWN_EVENT_NAME,
        not: true,
        operator: 'equals'
      }]
    };

    if (contract) {
      where.contract = [
        { value: contract, operator: 'equals', not: false }
      ];
    }

    if (name) {
      where.eventName = [
        { value: name, operator: 'equals', not: false }
      ];
    }

    const events = await this._db.getBlockEvents(blockHash, where);
    log(`getEvents: db hit, num events: ${events.length}`);

    return events;
  }

  async removeUnknownEvents (eventEntityClass: new () => EventInterface, block: BlockProgressInterface): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.removeEntities(
        dbTx,
        eventEntityClass,
        {
          where: {
            block: { id: block.id },
            eventName: UNKNOWN_EVENT_NAME
          },
          relations: ['block']
        }
      );

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._db.getAncestorAtDepth(blockHash, depth);
  }

  async saveEventEntity (dbEvent: EventInterface): Promise<EventInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.saveEventEntity(dbTx, dbEvent);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async saveEvents (dbEvents: EventInterface[]): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.saveEvents(dbTx, dbEvents);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._db.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number, maxBlockRange: number = DEFAULT_MAX_EVENTS_BLOCK_RANGE): Promise<Array<EventInterface>> {
    if (toBlockNumber <= fromBlockNumber) {
      throw new Error('toBlockNumber should be greater than fromBlockNumber');
    }

    if (maxBlockRange > -1 && (toBlockNumber - fromBlockNumber) > maxBlockRange) {
      throw new Error(`Max range (${maxBlockRange}) exceeded`);
    }

    return this._db.getEventsInRange(fromBlockNumber, toBlockNumber);
  }

  isWatchedContract (address : string): ContractInterface | undefined {
    return this._watchedContracts[address];
  }

  getContractsByKind (kind: string): ContractInterface[] {
    const watchedContracts = Object.values(this._watchedContracts)
      .filter(contract => contract.kind === kind);

    return watchedContracts;
  }

  getWatchedContracts (): ContractInterface[] {
    return Object.values(this._watchedContracts);
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
    assert(this._db.saveContract);
    this.updateStateStatusMap(address, {});
    const dbTx = await this._db.createTransactionRunner();

    // Use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress) if input to address is a contract address.
    // If a contract identifier is passed as address instead, no need to convert to checksum address.
    // Customize: use the kind input to filter out non-contract-address input to address.
    const contractAddress = (kind === '__protocol__') ? address : ethers.utils.getAddress(address);

    try {
      const contract = await this._db.saveContract(dbTx, contractAddress, kind, checkpoint, startingBlock);
      this.cacheContract(contract);
      await dbTx.commitTransaction();

      await this._jobQueue.pushJob(
        QUEUE_EVENT_PROCESSING,
        {
          kind: JOB_KIND_CONTRACT,
          contract
        },
        { priority: 1 }
      );
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  cacheContract (contract: ContractInterface): void {
    this._watchedContracts[contract.address] = contract;
  }

  async getStorageValue (storageLayout: StorageLayout, blockHash: string, token: string, variable: string, ...mappingKeys: any[]): Promise<ValueResult> {
    return getStorageValue(
      storageLayout,
      this._getStorageAt,
      blockHash,
      token,
      variable,
      ...mappingKeys
    );
  }

  getStateData (state: StateInterface): any {
    return codec.decode(Buffer.from(state.data));
  }

  async getLatestStateIndexedBlock (): Promise<BlockProgressInterface> {
    // Get current stateSyncStatus.
    const stateSyncStatus = await this._db.getStateSyncStatus();
    assert(stateSyncStatus, 'stateSyncStatus not found');

    // Get all the blocks at height stateSyncStatus.latestIndexedBlockNumber.
    const blocksAtHeight = await this.getBlocksAtHeight(stateSyncStatus.latestIndexedBlockNumber, false);

    // There can exactly one block at stateSyncStatus.latestIndexedBlockNumber height.
    assert(blocksAtHeight.length === 1);

    return blocksAtHeight[0];
  }

  async processCheckpoint (indexer: IndexerInterface, blockHash: string, checkpointInterval: number): Promise<void> {
    // Get all the contracts.
    const contracts = Object.values(this._watchedContracts);

    // Getting the block for checkpoint.
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // For each contract, merge the diff till now to create a checkpoint.
    for (const contract of contracts) {
      // Get State status for the contract.
      const stateStatus = this._stateStatusMap[contract.address];
      assert(stateStatus, `State status for contract ${contract.address} not found`);

      const initBlockNumber = stateStatus.init;

      // Check if contract has checkpointing on.
      // Check if it's time for a checkpoint or the init is in current block.
      if (
        contract.checkpoint &&
        (block.blockNumber % checkpointInterval === 0 || initBlockNumber === block.blockNumber)
      ) {
        await this.createCheckpoint(indexer, contract.address, block);
      }
    }
  }

  async processCLICheckpoint (indexer: IndexerInterface, contractAddress: string, blockHash?: string): Promise<string | undefined> {
    // Getting the block for checkpoint.
    let block;

    if (blockHash) {
      block = await this.getBlockProgress(blockHash);
    } else {
      // In case of empty blockHash from checkpoint CLI, get the latest indexed block from stateSyncStatus for the checkpoint.
      block = await this.getLatestStateIndexedBlock();
    }

    assert(block);

    const checkpointBlockHash = await this.createCheckpoint(indexer, contractAddress, block);
    assert(checkpointBlockHash, 'Checkpoint not created');

    return checkpointBlockHash;
  }

  async createStateCheckpoint (contractAddress: string, block: BlockProgressInterface, data: any): Promise<void> {
    // Get the contract.
    const contract = this._watchedContracts[contractAddress];
    assert(contract, `Contract ${contractAddress} not watched`);

    if (block.blockNumber < contract.startingBlock) {
      return;
    }

    // Create a checkpoint from the hook data without being concerned about diffs.
    const state = await this.prepareStateEntry(block, contractAddress, data, StateKind.Checkpoint);
    await this.saveOrUpdateState(state);
  }

  async createInit (
    indexer: IndexerInterface,
    blockHash: string,
    blockNumber: number
  ): Promise<void> {
    // Get all the contracts.
    const contracts = Object.values(this._watchedContracts);

    // Create an initial state for each contract.
    for (const contract of contracts) {
      // Check if contract has checkpointing on.
      if (contract.checkpoint) {
        // Check if starting block not reached yet.
        if (blockNumber < contract.startingBlock) {
          continue;
        }

        // Get State status for the contract.
        const stateStatus = this._stateStatusMap[contract.address];
        assert(stateStatus, `State status for contract ${contract.address} not found`);

        // Check if a 'init' State already exists.
        // Or if a 'diff' State already exists.
        // Or if a 'checkpoint' State already exists.
        // (A watcher with imported state won't have an init State, but it will have the imported checkpoint)
        if (
          stateStatus.init ||
          stateStatus.diff ||
          stateStatus.checkpoint
        ) {
          continue;
        }

        // Call initial state hook.
        assert(indexer.processInitialState);
        const stateData = await indexer.processInitialState(contract.address, blockHash);

        const block = await this.getBlockProgress(blockHash);
        assert(block);

        const state = await this.prepareStateEntry(block, contract.address, stateData, StateKind.Init);
        await this.saveOrUpdateState(state);
      }
    }
  }

  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // Get the contract.
    const contract = this._watchedContracts[contractAddress];
    assert(contract, `Contract ${contractAddress} not watched`);

    if (block.blockNumber < contract.startingBlock) {
      return;
    }

    // Create a staged diff state.
    const state = await this.prepareStateEntry(block, contractAddress, data, StateKind.DiffStaged);
    await this.saveOrUpdateState(state);
  }

  async finalizeDiffStaged (blockHash: string): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // Get all the staged diff states for the given blockHash.
    const stagedStates = await this._db.getStates({ block, kind: StateKind.DiffStaged });

    // For each staged block, create a diff block.
    for (const stagedState of stagedStates) {
      const data = codec.decode(Buffer.from(stagedState.data));
      await this.createDiff(stagedState.contractAddress, block, data);
    }

    // Remove all the staged diff states for current blockNumber.
    // (Including staged diff blocks associated with pruned blocks)
    await this.removeStates(block.blockNumber, StateKind.DiffStaged);
  }

  async createDiff (contractAddress: string, block: BlockProgressInterface, data: any): Promise<void> {
    // Get the contract.
    const contract = this._watchedContracts[contractAddress];
    assert(contract, `Contract ${contractAddress} not watched`);

    if (block.blockNumber < contract.startingBlock) {
      return;
    }

    // Get State status for the contract.
    const stateStatus = this._stateStatusMap[contractAddress];
    assert(stateStatus, `State status for contract ${contractAddress} not found`);

    // Get the latest checkpoint block number.
    const checkpointBlockNumber = stateStatus.checkpoint;

    if (!checkpointBlockNumber) {
      // Get the initial state block number.
      const initBlockNumber = stateStatus.init;

      // There should be an initial state at least.
      assert(initBlockNumber, `No initial state found for contract ${contractAddress}`);
    } else if (checkpointBlockNumber === block.blockNumber) {
      // Check if the latest checkpoint is in the same block if block number is same.
      const checkpoint = await this._db.getLatestState(contractAddress, StateKind.Checkpoint);
      assert(checkpoint);

      assert(checkpoint.block.blockHash !== block.blockHash, 'Checkpoint already created for the block hash');
    }

    const state = await this.prepareStateEntry(block, contractAddress, data, StateKind.Diff);
    await this.saveOrUpdateState(state);
  }

  async createCheckpoint (indexer: IndexerInterface, contractAddress: string, currentBlock: BlockProgressInterface): Promise<string | undefined> {
    // Get the contract.
    const contract = this._watchedContracts[contractAddress];
    assert(contract, `Contract ${contractAddress} not watched`);

    if (currentBlock.blockNumber < contract.startingBlock) {
      return;
    }

    // Make sure the block is marked complete.
    assert(currentBlock.isComplete, 'Block for a checkpoint should be marked as complete');

    // Get current stateSyncStatus.
    const stateSyncStatus = await this._db.getStateSyncStatus();
    assert(stateSyncStatus);

    // Make sure state for the block has been indexed.
    assert(currentBlock.blockNumber <= stateSyncStatus.latestIndexedBlockNumber, 'State should be indexed for checkpoint at a block');

    // Call state checkpoint hook and check if default checkpoint is disabled.
    assert(indexer.processStateCheckpoint);
    const disableDefaultCheckpoint = await indexer.processStateCheckpoint(contractAddress, currentBlock.blockHash);

    if (disableDefaultCheckpoint) {
      // Return if default checkpoint is disabled.
      // Return block hash for checkpoint CLI.
      return currentBlock.blockHash;
    }

    // Fetch the latest 'checkpoint' | 'init' for the contract to fetch diffs after it.
    let prevNonDiffState: StateInterface;
    let diffStartBlockNumber: number;
    const checkpointState = await this._db.getLatestState(contractAddress, StateKind.Checkpoint, currentBlock.blockNumber - 1);

    if (checkpointState) {
      const checkpointBlockNumber = checkpointState.block.blockNumber;

      prevNonDiffState = checkpointState;
      diffStartBlockNumber = checkpointBlockNumber;

      // Update State status map with the latest checkpoint info.
      // Essential while importing state as checkpoint at the snapshot block is added by import-state CLI.
      // (job-runner won't have the updated State status)
      this.updateStateStatusMap(contractAddress, { checkpoint: checkpointBlockNumber });
    } else {
      // There should be an initial state at least.
      const initBlock = await this._db.getLatestState(contractAddress, StateKind.Init);
      assert(initBlock, `No initial state found for contract ${contractAddress}`);

      prevNonDiffState = initBlock;
      // Take block number previous to initial state block as the checkpoint is to be created in the same block.
      diffStartBlockNumber = initBlock.block.blockNumber - 1;
    }

    const prevNonDiffStateData = codec.decode(Buffer.from(prevNonDiffState.data)) as any;
    let data = {
      state: prevNonDiffStateData.state
    };

    console.time(`time:indexer#createCheckpoint-${contractAddress}`);

    // Fetching and merging all diff blocks after the latest 'checkpoint' | 'init'.
    data = await this._mergeDiffsInRange(data, contractAddress, diffStartBlockNumber, currentBlock.blockNumber);

    const state = await this.prepareStateEntry(currentBlock, contractAddress, data, StateKind.Checkpoint);
    await this.saveOrUpdateState(state);

    console.timeEnd(`time:indexer#createCheckpoint-${contractAddress}`);
    return currentBlock.blockHash;
  }

  async prepareStateEntry (block: BlockProgressInterface, contractAddress: string, data: any, kind: StateKind):Promise<any> {
    console.time('time:indexer#prepareStateEntry');
    let stateEntry: StateInterface;

    // Get State status for the contract.
    const stateStatus = this._stateStatusMap[contractAddress];
    assert(stateStatus, `State status for contract ${contractAddress} not found`);

    // Get an existing 'init' | 'diff' | 'diff_staged' | 'checkpoint' State for current block, contractAddress to update.
    let currentState: StateInterface | undefined;
    const prevStateBlockNumber = stateStatus[kind];

    // Fetch previous State from DB if:
    // present at the same height (to update)
    // or for checkpoint kind (to build upon previous checkpoint)
    if (kind === 'checkpoint' || (prevStateBlockNumber && prevStateBlockNumber === block.blockNumber)) {
      const currentStates = await this._db.getStates({ block, contractAddress, kind });

      // There can be at most one State for a (block, contractAddress, kind) combination.
      assert(currentStates.length <= 1);
      currentState = currentStates[0];
    }

    if (currentState) {
      // Update current State of same kind if it exists.
      stateEntry = currentState;

      // Update the data field.
      const oldData = codec.decode(Buffer.from(stateEntry.data));
      data = _.merge(oldData, data);
    } else {
      // Create a new State instance.
      stateEntry = this._db.getNewState();

      // Fetch the parent State entry.
      const parentState = await this._db.getLatestState(contractAddress, null, block.blockNumber);

      // Setting the meta-data for a State entry (done only once per State entry).
      data.meta = {
        id: contractAddress,
        kind,
        parent: {
          '/': parentState ? parentState.cid : null
        },
        ethBlock: {
          cid: {
            '/': block.cid
          },
          num: block.blockNumber
        }
      };
    }

    // Encoding the data using dag-cbor codec.
    const bytes = codec.encode(data);

    // Calculating sha256 (multi)hash of the encoded data.
    const hash = await sha256.digest(bytes);

    // Calculating the CID: v1, code: dag-cbor, hash.
    const cid = CID.create(1, codec.code, hash);

    // Update stateEntry with new data.
    stateEntry = Object.assign(stateEntry, {
      block,
      contractAddress,
      cid: cid.toString(),
      kind: data.meta.kind,
      data: Buffer.from(bytes)
    });

    console.timeEnd('time:indexer#prepareStateEntry');
    return stateEntry;
  }

  async getStatesByHash (blockHash: string): Promise<StateInterface[]> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._db.getStates({ block });
  }

  async getStateByCID (cid: string): Promise<StateInterface | undefined> {
    const ipldBlocks = await this._db.getStates({ cid });

    // There can be only one IPLDBlock with a particular cid.
    assert(ipldBlocks.length <= 1);

    return ipldBlocks[0];
  }

  async saveOrUpdateState (state: StateInterface): Promise<StateInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.saveOrUpdateState(dbTx, state);

      // Get State status for the contract.
      const stateStatus = this._stateStatusMap[res.contractAddress];
      assert(stateStatus, `State status for contract ${res.contractAddress} not found`);

      // Update the State status for the kind.
      stateStatus[res.kind] = res.block.blockNumber;

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async removeStates (blockNumber: number, kind: StateKind): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.removeStates(dbTx, blockNumber, kind);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async fetchStateStatus (): Promise<void> {
    const contracts = Object.values(this._watchedContracts);

    // TODO: Fire a single query for all contracts.
    for (const contract of contracts) {
      const initState = await this._db.getLatestState(contract.address, StateKind.Init);
      const diffState = await this._db.getLatestState(contract.address, StateKind.Diff);
      const diffStagedState = await this._db.getLatestState(contract.address, StateKind.DiffStaged);
      const checkpointState = await this._db.getLatestState(contract.address, StateKind.Checkpoint);

      this._stateStatusMap[contract.address] = {
        init: initState?.block.blockNumber,
        diff: diffState?.block.blockNumber,
        diff_staged: diffStagedState?.block.blockNumber,
        checkpoint: checkpointState?.block.blockNumber
      };
    }
  }

  updateStateStatusMap (address: string, stateStatus: StateStatus): void {
    // Get and update State status for the contract.
    const oldStateStatus = this._stateStatusMap[address];
    this._stateStatusMap[address] = _.merge(oldStateStatus, stateStatus);
  }

  parseEvent (logDescription: ethers.utils.LogDescription): { eventName: string, eventInfo: any, eventSignature: string } {
    const eventInfo = logDescription.eventFragment.inputs.reduce((acc: any, input, index) => {
      acc[input.name] = this._parseLogArg(input, logDescription.args[index]);

      return acc;
    }, {});

    return {
      eventName: logDescription.name,
      eventInfo,
      eventSignature: logDescription.signature
    };
  }

  _parseLogArg (param: ethers.utils.ParamType, arg: ethers.utils.Result): any {
    if (ethers.utils.Indexed.isIndexed(arg)) {
      // Get hash if indexed reference type.
      return arg.hash;
    }

    if (ethers.BigNumber.isBigNumber(arg)) {
      return arg.toBigInt();
    }

    if (param.baseType === 'array') {
      return arg.map(el => this._parseLogArg(param.arrayChildren, el));
    }

    if (param.baseType === 'tuple') {
      return param.components.reduce((acc: any, component) => {
        acc[component.name] = this._parseLogArg(component, arg[component.name]);
        return acc;
      }, {});
    }

    return arg;
  }

  async _mergeDiffsInRange (data: { state: any }, contractAddress: string, startBlock: number, endBlock: number): Promise<{ state: any }> {
    // Merge all diff blocks in the given range in batches.
    for (let i = startBlock; i < endBlock;) {
      const endBlockHeight = Math.min(i + DIFF_MERGE_BATCH_SIZE, endBlock);

      console.time(`time:indexer#_mergeDiffsInRange-${i}-${endBlockHeight}-${contractAddress}`);
      const diffBlocks = await this._db.getDiffStatesInRange(contractAddress, i, endBlockHeight);

      // Merge all diff blocks in the current batch.
      for (const diffBlock of diffBlocks) {
        const diff = codec.decode(Buffer.from(diffBlock.data)) as any;
        data.state = _.merge(data.state, diff.state);
      }

      console.timeEnd(`time:indexer#_mergeDiffsInRange-${i}-${endBlockHeight}-${contractAddress}`);
      i = endBlockHeight;
    }

    return data;
  }
}
