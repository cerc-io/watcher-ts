//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import debug from 'debug';
import { ethers } from 'ethers';
import _ from 'lodash';
import { sha256 } from 'multiformats/hashes/sha2';
import { CID } from 'multiformats/cid';

import * as codec from '@ipld/dag-cbor';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { GetStorageAt, getStorageValue, StorageLayout } from '@cerc-io/solidity-mapper';

import { BlockProgressInterface, DatabaseInterface, EventInterface, SyncStatusInterface, ContractInterface, IPLDBlockInterface, IndexerInterface, StateKind } from './types';
import { UNKNOWN_EVENT_NAME, JOB_KIND_CONTRACT, QUEUE_EVENT_PROCESSING } from './constants';
import { JobQueue } from './job-queue';
import { Where, QueryOptions } from './database';
import { ServerConfig } from './config';
import { IPFSClient } from './ipfs';

const DEFAULT_MAX_EVENTS_BLOCK_RANGE = 1000;

const log = debug('vulcanize:indexer');

export interface ValueResult {
  value: any;
  proof?: {
    data: string;
  }
}

export interface IpldStatus {
  init?: number;
  diff?: number;
  checkpoint?: number;
  // eslint-disable-next-line camelcase
  diff_staged?: number;
}

export type ResultIPLDBlock = {
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
  _ipfsClient: IPFSClient;

  _watchedContracts: { [key: string]: ContractInterface } = {};
  _ipldStatusMap: { [key: string]: IpldStatus } = {};

  constructor (
    serverConfig: ServerConfig,
    db: DatabaseInterface,
    ethClient: EthClient,
    ethProvider: ethers.providers.BaseProvider,
    jobQueue: JobQueue,
    ipfsClient: IPFSClient
  ) {
    this._serverConfig = serverConfig;
    this._db = db;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._jobQueue = jobQueue;
    this._ipfsClient = ipfsClient;
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

  async fetchBlockWithEvents (block: DeepPartial<BlockProgressInterface>, fetchAndSaveEvents: (block: DeepPartial<BlockProgressInterface>) => Promise<BlockProgressInterface>): Promise<BlockProgressInterface> {
    assert(block.blockHash);

    log(`getBlockEvents: fetching from upstream server ${block.blockHash}`);
    const blockProgress = await fetchAndSaveEvents(block);
    log(`getBlockEvents: fetched for block: ${blockProgress.blockHash} num events: ${blockProgress.numEvents}`);

    return blockProgress;
  }

  async fetchBlockEvents (block: DeepPartial<BlockProgressInterface>, fetchEvents: (block: DeepPartial<BlockProgressInterface>) => Promise<DeepPartial<EventInterface>[]>): Promise<DeepPartial<EventInterface>[]> {
    assert(block.blockHash);

    log(`getBlockEvents: fetching from upstream server ${block.blockHash}`);
    console.time(`time:indexer#fetchBlockEvents-fetchAndSaveEvents-${block.blockHash}`);
    const events = await fetchEvents(block);
    console.timeEnd(`time:indexer#fetchBlockEvents-fetchAndSaveEvents-${block.blockHash}`);
    log(`getBlockEvents: fetched for block: ${block.blockHash} num events: ${events.length}`);

    return events;
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
    this.updateIPLDStatusMap(address, {});
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

  getIPLDData (ipldBlock: IPLDBlockInterface): any {
    return codec.decode(Buffer.from(ipldBlock.data));
  }

  async pushToIPFS (data: any): Promise<void> {
    await this._ipfsClient.push(data);
  }

  isIPFSConfigured (): boolean {
    const ipfsAddr = this._serverConfig.ipfsApiAddr;

    // Return false if ipfsAddr is undefined | null | empty string.
    return (ipfsAddr !== undefined && ipfsAddr !== null && ipfsAddr !== '');
  }

  async getLatestHooksProcessedBlock (): Promise<BlockProgressInterface> {
    // Get current hookStatus.
    const ipldStatus = await this._db.getIPLDStatus();
    assert(ipldStatus, 'IPLD status not found');

    // Get all the blocks at height hookStatus.latestProcessedBlockNumber.
    const blocksAtHeight = await this.getBlocksAtHeight(ipldStatus.latestHooksBlockNumber, false);

    // There can exactly one block at hookStatus.latestProcessedBlockNumber height.
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
      // Get IPLD status for the contract.
      const ipldStatus = this._ipldStatusMap[contract.address];
      assert(ipldStatus, `IPLD status for contract ${contract.address} not found`);

      const initBlockNumber = ipldStatus.init;

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
      // In case of empty blockHash from checkpoint CLI, get the latest processed block from hookStatus for the checkpoint.
      block = await this.getLatestHooksProcessedBlock();
    }

    assert(block);

    const checkpointBlockHash = await this.createCheckpoint(indexer, contractAddress, block);
    assert(checkpointBlockHash, 'Checkpoint not created');

    // Push checkpoint to IPFS if configured.
    if (this.isIPFSConfigured()) {
      const checkpointIPLDBlocks = await this._db.getIPLDBlocks({ block, contractAddress, kind: StateKind.Checkpoint });

      // There can be at most one IPLDBlock for a (block, contractAddress, kind) combination.
      assert(checkpointIPLDBlocks.length <= 1);
      const checkpointIPLDBlock = checkpointIPLDBlocks[0];

      const checkpointData = this.getIPLDData(checkpointIPLDBlock);
      await this.pushToIPFS(checkpointData);
    }

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
    const ipldBlock = await this.prepareIPLDBlock(block, contractAddress, data, StateKind.Checkpoint);
    await this.saveOrUpdateIPLDBlock(ipldBlock);
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

        // Get IPLD status for the contract.
        const ipldStatus = this._ipldStatusMap[contract.address];
        assert(ipldStatus, `IPLD status for contract ${contract.address} not found`);

        // Check if a 'init' IPLDBlock already exists.
        // Or if a 'diff' IPLDBlock already exists.
        // Or if a 'checkpoint' IPLDBlock already exists.
        // (A watcher with imported state won't have an init IPLDBlock, but it will have the imported checkpoint)
        if (
          ipldStatus.init ||
          ipldStatus.diff ||
          ipldStatus.checkpoint
        ) {
          continue;
        }

        // Call initial state hook.
        assert(indexer.processInitialState);
        const stateData = await indexer.processInitialState(contract.address, blockHash);

        const block = await this.getBlockProgress(blockHash);
        assert(block);

        const ipldBlock = await this.prepareIPLDBlock(block, contract.address, stateData, StateKind.Init);
        await this.saveOrUpdateIPLDBlock(ipldBlock);

        // Push initial state to IPFS if configured.
        if (this.isIPFSConfigured()) {
          const ipldData = this.getIPLDData(ipldBlock);
          await this.pushToIPFS(ipldData);
        }
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

    // Create a staged diff block.
    const ipldBlock = await this.prepareIPLDBlock(block, contractAddress, data, StateKind.DiffStaged);
    await this.saveOrUpdateIPLDBlock(ipldBlock);
  }

  async finalizeDiffStaged (blockHash: string): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // Get all the staged diff blocks for the given blockHash.
    const stagedBlocks = await this._db.getIPLDBlocks({ block, kind: StateKind.DiffStaged });

    // For each staged block, create a diff block.
    for (const stagedBlock of stagedBlocks) {
      const data = codec.decode(Buffer.from(stagedBlock.data));
      await this.createDiff(stagedBlock.contractAddress, block, data);
    }

    // Remove all the staged diff blocks for current blockNumber.
    // (Including staged diff blocks associated with pruned blocks)
    await this.removeIPLDBlocks(block.blockNumber, StateKind.DiffStaged);
  }

  async createDiff (contractAddress: string, block: BlockProgressInterface, data: any): Promise<void> {
    // Get the contract.
    const contract = this._watchedContracts[contractAddress];
    assert(contract, `Contract ${contractAddress} not watched`);

    if (block.blockNumber < contract.startingBlock) {
      return;
    }

    // Get IPLD status for the contract.
    const ipldStatus = this._ipldStatusMap[contractAddress];
    assert(ipldStatus, `IPLD status for contract ${contractAddress} not found`);

    // Get the latest checkpoint block number.
    const checkpointBlockNumber = ipldStatus.checkpoint;

    if (!checkpointBlockNumber) {
      // Get the initial state block number.
      const initBlockNumber = ipldStatus.init;

      // There should be an initial state at least.
      assert(initBlockNumber, 'No initial state found');
    } else if (checkpointBlockNumber === block.blockNumber) {
      // Check if the latest checkpoint is in the same block if block number is same.
      const checkpoint = await this._db.getLatestIPLDBlock(contractAddress, StateKind.Checkpoint);
      assert(checkpoint);

      assert(checkpoint.block.blockHash !== block.blockHash, 'Checkpoint already created for the block hash');
    }

    const ipldBlock = await this.prepareIPLDBlock(block, contractAddress, data, StateKind.Diff);
    await this.saveOrUpdateIPLDBlock(ipldBlock);
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

    // Get current hookStatus.
    const ipldStatus = await this._db.getIPLDStatus();
    assert(ipldStatus);

    // Make sure the hooks have been processed for the block.
    assert(currentBlock.blockNumber <= ipldStatus.latestHooksBlockNumber, 'Block for a checkpoint should have hooks processed');

    // Call state checkpoint hook and check if default checkpoint is disabled.
    assert(indexer.processStateCheckpoint);
    const disableDefaultCheckpoint = await indexer.processStateCheckpoint(contractAddress, currentBlock.blockHash);

    if (disableDefaultCheckpoint) {
      // Return if default checkpoint is disabled.
      // Return block hash for checkpoint CLI.
      return currentBlock.blockHash;
    }

    // Fetch the latest 'checkpoint' | 'init' for the contract to fetch diffs after it.
    let prevNonDiffBlock: IPLDBlockInterface;
    let diffStartBlockNumber: number;
    const checkpointBlock = await this._db.getLatestIPLDBlock(contractAddress, StateKind.Checkpoint, currentBlock.blockNumber - 1);

    if (checkpointBlock) {
      const checkpointBlockNumber = checkpointBlock.block.blockNumber;

      prevNonDiffBlock = checkpointBlock;
      diffStartBlockNumber = checkpointBlockNumber;

      // Update IPLD status map with the latest checkpoint info.
      // Essential while importing state as checkpoint at the snapshot block is added by import-state CLI.
      // (job-runner won't have the updated ipld status)
      this.updateIPLDStatusMap(contractAddress, { checkpoint: checkpointBlockNumber });
    } else {
      // There should be an initial state at least.
      const initBlock = await this._db.getLatestIPLDBlock(contractAddress, StateKind.Init);
      assert(initBlock, 'No initial state found');

      prevNonDiffBlock = initBlock;
      // Take block number previous to initial state block as the checkpoint is to be created in the same block.
      diffStartBlockNumber = initBlock.block.blockNumber - 1;
    }

    // Fetching all diff blocks after the latest 'checkpoint' | 'init'.
    const diffBlocks = await this._db.getDiffIPLDBlocksInRange(contractAddress, diffStartBlockNumber, currentBlock.blockNumber);

    const prevNonDiffBlockData = codec.decode(Buffer.from(prevNonDiffBlock.data)) as any;
    const data = {
      state: prevNonDiffBlockData.state
    };

    for (const diffBlock of diffBlocks) {
      const diff = codec.decode(Buffer.from(diffBlock.data)) as any;
      data.state = _.merge(data.state, diff.state);
    }

    const ipldBlock = await this.prepareIPLDBlock(currentBlock, contractAddress, data, StateKind.Checkpoint);
    await this.saveOrUpdateIPLDBlock(ipldBlock);

    return currentBlock.blockHash;
  }

  async prepareIPLDBlock (block: BlockProgressInterface, contractAddress: string, data: any, kind: StateKind):Promise<any> {
    console.time('time:ipld-indexer#prepareIPLDBlock');
    let ipldBlock: IPLDBlockInterface;

    // Get IPLD status for the contract.
    const ipldStatus = this._ipldStatusMap[contractAddress];
    assert(ipldStatus, `IPLD status for contract ${contractAddress} not found`);

    // Get an existing 'init' | 'diff' | 'diff_staged' | 'checkpoint' IPLDBlock for current block, contractAddress to update.
    let currentIPLDBlock: IPLDBlockInterface | undefined;
    const prevIPLDBlockNumber = ipldStatus[kind];

    // Fetch from DB for previous IPLD block or for checkpoint kind.
    if (kind === 'checkpoint' || (prevIPLDBlockNumber && prevIPLDBlockNumber === block.blockNumber)) {
      const currentIPLDBlocks = await this._db.getIPLDBlocks({ block, contractAddress, kind });

      // There can be at most one IPLDBlock for a (block, contractAddress, kind) combination.
      assert(currentIPLDBlocks.length <= 1);
      currentIPLDBlock = currentIPLDBlocks[0];
    }

    if (currentIPLDBlock) {
      // Update current IPLDBlock of same kind if it exists.
      ipldBlock = currentIPLDBlock;

      // Update the data field.
      const oldData = codec.decode(Buffer.from(ipldBlock.data));
      data = _.merge(oldData, data);
    } else {
      // Create a new IPLDBlock instance.
      ipldBlock = this._db.getNewIPLDBlock();

      // Fetch the parent IPLDBlock.
      const parentIPLDBlock = await this._db.getLatestIPLDBlock(contractAddress, null, block.blockNumber);

      // Setting the meta-data for an IPLDBlock (done only once per IPLD block).
      data.meta = {
        id: contractAddress,
        kind,
        parent: {
          '/': parentIPLDBlock ? parentIPLDBlock.cid : null
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

    // Update ipldBlock with new data.
    ipldBlock = Object.assign(ipldBlock, {
      block,
      contractAddress,
      cid: cid.toString(),
      kind: data.meta.kind,
      data: Buffer.from(bytes)
    });

    console.timeEnd('time:ipld-indexer#prepareIPLDBlock');
    return ipldBlock;
  }

  async getIPLDBlocksByHash (blockHash: string): Promise<IPLDBlockInterface[]> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._db.getIPLDBlocks({ block });
  }

  async getIPLDBlockByCid (cid: string): Promise<IPLDBlockInterface | undefined> {
    const ipldBlocks = await this._db.getIPLDBlocks({ cid });

    // There can be only one IPLDBlock with a particular cid.
    assert(ipldBlocks.length <= 1);

    return ipldBlocks[0];
  }

  async saveOrUpdateIPLDBlock (ipldBlock: IPLDBlockInterface): Promise<IPLDBlockInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.saveOrUpdateIPLDBlock(dbTx, ipldBlock);

      // Get IPLD status for the contract.
      const ipldStatus = this._ipldStatusMap[res.contractAddress];
      assert(ipldStatus, `IPLD status for contract ${res.contractAddress} not found`);

      // Update the IPLD status for the kind.
      ipldStatus[res.kind] = res.block.blockNumber;

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async removeIPLDBlocks (blockNumber: number, kind: StateKind): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.removeIPLDBlocks(dbTx, blockNumber, kind);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async fetchIPLDStatus (): Promise<void> {
    const contracts = Object.values(this._watchedContracts);

    for (const contract of contracts) {
      const initIPLDBlock = await this._db.getLatestIPLDBlock(contract.address, StateKind.Init);
      const diffIPLDBlock = await this._db.getLatestIPLDBlock(contract.address, StateKind.Diff);
      const diffStagedIPLDBlock = await this._db.getLatestIPLDBlock(contract.address, StateKind.DiffStaged);
      const checkpointIPLDBlock = await this._db.getLatestIPLDBlock(contract.address, StateKind.Checkpoint);

      this._ipldStatusMap[contract.address] = {
        init: initIPLDBlock?.block.blockNumber,
        diff: diffIPLDBlock?.block.blockNumber,
        diff_staged: diffStagedIPLDBlock?.block.blockNumber,
        checkpoint: checkpointIPLDBlock?.block.blockNumber
      };
    }
  }

  updateIPLDStatusMap (address: string, ipldStatus: IpldStatus): void {
    // Get and update IPLD status for the contract.
    const ipldStatusOld = this._ipldStatusMap[address];
    this._ipldStatusMap[address] = _.merge(ipldStatusOld, ipldStatus);
  }

  parseEvent (logDescription: ethers.utils.LogDescription): { eventName: string, eventInfo: any } {
    const eventName = logDescription.name;

    const eventInfo = logDescription.eventFragment.inputs.reduce((acc: any, input, index) => {
      acc[input.name] = this._parseLogArg(input, logDescription.args[index]);

      return acc;
    }, {});

    return {
      eventName,
      eventInfo
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
}
