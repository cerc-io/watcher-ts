//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';

import { JsonFragment } from '@ethersproject/abi';
import { JsonRpcProvider } from '@ethersproject/providers';
import * as codec from '@ipld/dag-cbor';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { StorageLayout } from '@vulcanize/solidity-mapper';
import {
  IPLDIndexer as BaseIndexer,
  IPLDIndexerInterface,
  ValueResult,
  UNKNOWN_EVENT_NAME,
  ServerConfig,
  JobQueue,
  Where,
  QueryOptions,
  updateStateForElementaryType,
  updateStateForMappingType,
  BlockHeight,
  IPFSClient,
  StateKind,
  IpldStatus as IpldStatusInterface,
  getFullTransaction
} from '@vulcanize/util';

import PhisherRegistryArtifacts from './artifacts/PhisherRegistry.json';
import { Database } from './database';
import { createInitialState, handleEvent, createStateDiff, createStateCheckpoint } from './hooks';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { IpldStatus } from './entity/IpldStatus';
import { BlockProgress } from './entity/BlockProgress';
import { IPLDBlock } from './entity/IPLDBlock';
import { IsMember } from './entity/IsMember';
import { IsPhisher } from './entity/IsPhisher';
import { IsRevoked } from './entity/IsRevoked';
import { _Owner } from './entity/_Owner';
import { MultiNonce } from './entity/MultiNonce';

const log = debug('vulcanize:indexer');

export const KIND_PHISHERREGISTRY = 'PhisherRegistry';

export type ResultEvent = {
  block: {
    cid: string;
    hash: string;
    number: number;
    timestamp: number;
    parentHash: string;
  };
  tx: {
    hash: string;
    from: string;
    to: string;
    index: number;
  };

  contract: string;

  eventIndex: number;
  eventSignature: string;
  event: any;

  proof: string;
};

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

export class Indexer implements IPLDIndexerInterface {
  _db: Database
  _ethClient: EthClient
  _ethProvider: JsonRpcProvider
  _baseIndexer: BaseIndexer
  _serverConfig: ServerConfig

  _abiMap: Map<string, JsonFragment[]>
  _storageLayoutMap: Map<string, StorageLayout>
  _contractMap: Map<string, ethers.utils.Interface>

  _ipfsClient: IPFSClient

  constructor (serverConfig: ServerConfig, db: Database, ethClient: EthClient, ethProvider: JsonRpcProvider, jobQueue: JobQueue) {
    assert(db);
    assert(ethClient);

    this._db = db;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._ipfsClient = new IPFSClient(this._serverConfig.ipfsApiAddr);
    this._baseIndexer = new BaseIndexer(this._serverConfig, this._db, this._ethClient, this._ethProvider, jobQueue, this._ipfsClient);

    this._abiMap = new Map();
    this._storageLayoutMap = new Map();
    this._contractMap = new Map();

    const {
      abi: PhisherRegistryABI,
      storageLayout: PhisherRegistryStorageLayout
    } = PhisherRegistryArtifacts;

    assert(PhisherRegistryABI);
    this._abiMap.set(KIND_PHISHERREGISTRY, PhisherRegistryABI);
    assert(PhisherRegistryStorageLayout);
    this._storageLayoutMap.set(KIND_PHISHERREGISTRY, PhisherRegistryStorageLayout);
    this._contractMap.set(KIND_PHISHERREGISTRY, new ethers.utils.Interface(PhisherRegistryABI));
  }

  get serverConfig (): ServerConfig {
    return this._serverConfig;
  }

  async init (): Promise<void> {
    await this._baseIndexer.fetchContracts();
    await this._baseIndexer.fetchIPLDStatus();
  }

  getResultEvent (event: Event): ResultEvent {
    const block = event.block;
    const eventFields = JSONbig.parse(event.eventInfo);
    const { tx, eventSignature } = JSON.parse(event.extraInfo);

    return {
      block: {
        cid: block.cid,
        hash: block.blockHash,
        number: block.blockNumber,
        timestamp: block.blockTimestamp,
        parentHash: block.parentHash
      },

      tx: {
        hash: event.txHash,
        from: tx.src,
        to: tx.dst,
        index: tx.index
      },

      contract: event.contract,

      eventIndex: event.index,
      eventSignature,
      event: {
        __typename: `${event.eventName}Event`,
        ...eventFields
      },

      // TODO: Return proof only if requested.
      proof: JSON.parse(event.proof)
    };
  }

  getResultIPLDBlock (ipldBlock: IPLDBlock): ResultIPLDBlock {
    const block = ipldBlock.block;

    const data = codec.decode(Buffer.from(ipldBlock.data)) as any;

    return {
      block: {
        cid: block.cid,
        hash: block.blockHash,
        number: block.blockNumber,
        timestamp: block.blockTimestamp,
        parentHash: block.parentHash
      },
      contractAddress: ipldBlock.contractAddress,
      cid: ipldBlock.cid,
      kind: ipldBlock.kind,
      data: JSON.stringify(data)
    };
  }

  async multiNonce (blockHash: string, contractAddress: string, key0: string, key1: bigint, diff = false): Promise<ValueResult> {
    let entity = await this._db.getMultiNonce({ blockHash, contractAddress, key0, key1 });

    if (entity) {
      log('multiNonce: db hit.');
    } else {
      log('multiNonce: db miss, fetching from upstream server');

      entity = await this._getStorageEntity(
        blockHash,
        contractAddress,
        MultiNonce,
        'multiNonce',
        { key0, key1 },
        BigInt(0)
      );

      await this._db.saveMultiNonce(entity);

      if (diff) {
        const stateUpdate = updateStateForMappingType({}, 'multiNonce', [key0.toString(), key1.toString()], entity.value.toString());
        await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
      }
    }

    return {
      value: entity.value,
      proof: JSON.parse(entity.proof)
    };
  }

  async _owner (blockHash: string, contractAddress: string, diff = false): Promise<ValueResult> {
    let entity = await this._db._getOwner({ blockHash, contractAddress });

    if (entity) {
      log('_owner: db hit.');
    } else {
      log('_owner: db miss, fetching from upstream server');

      entity = await this._getStorageEntity(
        blockHash,
        contractAddress,
        _Owner,
        '_owner',
        {},
        ''
      );

      await this._db._saveOwner(entity);

      if (diff) {
        const stateUpdate = updateStateForElementaryType({}, '_owner', entity.value.toString());
        await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
      }
    }

    return {
      value: entity.value,
      proof: JSON.parse(entity.proof)
    };
  }

  async isRevoked (blockHash: string, contractAddress: string, key0: string, diff = false): Promise<ValueResult> {
    let entity = await this._db.getIsRevoked({ blockHash, contractAddress, key0 });

    if (entity) {
      log('isRevoked: db hit.');
    } else {
      log('isRevoked: db miss, fetching from upstream server');

      entity = await this._getStorageEntity(
        blockHash,
        contractAddress,
        IsRevoked,
        'isRevoked',
        { key0 },
        false
      );

      await this._db.saveIsRevoked(entity);

      if (diff) {
        const stateUpdate = updateStateForMappingType({}, 'isRevoked', [key0.toString()], entity.value.toString());
        await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
      }
    }

    return {
      value: entity.value,
      proof: JSON.parse(entity.proof)
    };
  }

  async isPhisher (blockHash: string, contractAddress: string, key0: string, diff = false): Promise<ValueResult> {
    let entity = await this._db.getIsPhisher({ blockHash, contractAddress, key0 });

    if (entity) {
      log('isPhisher: db hit.');
    } else {
      log('isPhisher: db miss, fetching from upstream server');

      entity = await this._getStorageEntity(
        blockHash,
        contractAddress,
        IsPhisher,
        'isPhisher',
        { key0 },
        false
      );

      await this._db.saveIsPhisher(entity);

      if (diff) {
        const stateUpdate = updateStateForMappingType({}, 'isPhisher', [key0.toString()], entity.value.toString());
        await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
      }
    }

    return {
      value: entity.value,
      proof: JSON.parse(entity.proof)
    };
  }

  async isMember (blockHash: string, contractAddress: string, key0: string, diff = false): Promise<ValueResult> {
    let entity = await this._db.getIsMember({ blockHash, contractAddress, key0 });

    if (entity) {
      log('isMember: db hit.');
    } else {
      log('isMember: db miss, fetching from upstream server');

      entity = await this._getStorageEntity(
        blockHash,
        contractAddress,
        IsMember,
        'isMember',
        { key0 },
        false
      );

      await this._db.saveIsMember(entity);

      if (diff) {
        const stateUpdate = updateStateForMappingType({}, 'isMember', [key0.toString()], entity.value.toString());
        await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
      }
    }

    return {
      value: entity.value,
      proof: JSON.parse(entity.proof)
    };
  }

  async _getStorageEntity<Entity> (
    blockHash: string,
    contractAddress: string,
    entity: new () => Entity,
    storageVariableName: string,
    mappingKeys: {[key: string]: any},
    defaultValue: any
  ): Promise<Entity> {
    const [{ number }, syncStatus] = await Promise.all([
      this._ethProvider.send('eth_getHeaderByHash', [blockHash]),
      this.getSyncStatus()
    ]);

    const blockNumber = ethers.BigNumber.from(number).toNumber();

    let result: ValueResult = {
      value: defaultValue
    };

    if (syncStatus && blockNumber < syncStatus.initialIndexedBlockNumber) {
      const entityFields: any = { blockNumber, contractAddress, ...mappingKeys };
      const entityData: any = await this._db.getPrevEntity(entity, entityFields);

      if (entityData) {
        result = {
          value: entityData.value,
          proof: JSON.parse(entityData.proof)
        };
      }
    } else {
      const storageLayout = this._storageLayoutMap.get(KIND_PHISHERREGISTRY);
      assert(storageLayout);

      result = await this._baseIndexer.getStorageValue(
        storageLayout,
        blockHash,
        contractAddress,
        storageVariableName,
        ...Object.values(mappingKeys)
      );
    }

    return {
      blockHash,
      blockNumber,
      contractAddress,
      ...mappingKeys,
      value: result.value,
      proof: result.proof ? JSONbig.stringify(result.proof) : null
    } as any;
  }

  async pushToIPFS (data: any): Promise<void> {
    await this._baseIndexer.pushToIPFS(data);
  }

  async processInitialState (contractAddress: string, blockHash: string): Promise<any> {
    // Call initial state hook.
    return createInitialState(this, contractAddress, blockHash);
  }

  async processStateCheckpoint (contractAddress: string, blockHash: string): Promise<boolean> {
    // Call checkpoint hook.
    return createStateCheckpoint(this, contractAddress, blockHash);
  }

  async processCanonicalBlock (blockHash: string): Promise<void> {
    // Finalize staged diff blocks if any.
    await this._baseIndexer.finalizeDiffStaged(blockHash);

    // Call custom stateDiff hook.
    await createStateDiff(this, blockHash);
  }

  async processCheckpoint (blockHash: string): Promise<void> {
    // Return if checkpointInterval is <= 0.
    const checkpointInterval = this._serverConfig.checkpointInterval;
    if (checkpointInterval <= 0) return;

    await this._baseIndexer.processCheckpoint(this, blockHash, checkpointInterval);
  }

  async processCLICheckpoint (contractAddress: string, blockHash?: string): Promise<string | undefined> {
    return this._baseIndexer.processCLICheckpoint(this, contractAddress, blockHash);
  }

  async getPrevIPLDBlock (blockHash: string, contractAddress: string, kind?: string): Promise<IPLDBlock | undefined> {
    return this._db.getPrevIPLDBlock(blockHash, contractAddress, kind);
  }

  async getLatestIPLDBlock (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<IPLDBlock | undefined> {
    return this._db.getLatestIPLDBlock(contractAddress, kind, blockNumber);
  }

  async getIPLDBlocksByHash (blockHash: string): Promise<IPLDBlock[]> {
    return this._baseIndexer.getIPLDBlocksByHash(blockHash);
  }

  async getIPLDBlockByCid (cid: string): Promise<IPLDBlock | undefined> {
    return this._baseIndexer.getIPLDBlockByCid(cid);
  }

  getIPLDData (ipldBlock: IPLDBlock): any {
    return this._baseIndexer.getIPLDData(ipldBlock);
  }

  isIPFSConfigured (): boolean {
    return this._baseIndexer.isIPFSConfigured();
  }

  // Method used to create auto diffs (diff_staged).
  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    await this._baseIndexer.createDiffStaged(contractAddress, blockHash, data);
  }

  // Method to be used by createStateDiff hook.
  async createDiff (contractAddress: string, blockHash: string, data: any): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    await this._baseIndexer.createDiff(contractAddress, block, data);
  }

  // Method to be used by createStateCheckpoint hook.
  async createStateCheckpoint (contractAddress: string, blockHash: string, data: any): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._baseIndexer.createStateCheckpoint(contractAddress, block, data);
  }

  // Method to be used by checkpoint CLI.
  async createCheckpoint (contractAddress: string, blockHash: string): Promise<string | undefined> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._baseIndexer.createCheckpoint(this, contractAddress, block);
  }

  async saveOrUpdateIPLDBlock (ipldBlock: IPLDBlock): Promise<IPLDBlock> {
    return this._baseIndexer.saveOrUpdateIPLDBlock(ipldBlock);
  }

  async removeIPLDBlocks (blockNumber: number, kind: StateKind): Promise<void> {
    await this._baseIndexer.removeIPLDBlocks(blockNumber, kind);
  }

  async triggerIndexingOnEvent (event: Event): Promise<void> {
    const resultEvent = this.getResultEvent(event);

    // Call custom hook function for indexing on event.
    await handleEvent(this, resultEvent);
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);
  }

  async processBlock (blockHash: string, blockNumber: number): Promise<void> {
    // Call a function to create initial state for contracts.
    await this._baseIndexer.createInit(this, blockHash, blockNumber);
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    const { topics, data } = logObj;

    const contract = this._contractMap.get(kind);
    assert(contract);

    const logDescription = contract.parseLog({ data, topics });

    const { eventName, eventInfo } = this._baseIndexer.parseEvent(logDescription);

    return {
      eventName,
      eventInfo,
      eventSignature: logDescription.signature
    };
  }

  async getIPLDStatus (): Promise<IpldStatus | undefined> {
    return this._db.getIPLDStatus();
  }

  async updateIPLDStatusHooksBlock (blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateIPLDStatusHooksBlock(dbTx, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateIPLDStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateIPLDStatusCheckpointBlock(dbTx, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateIPLDStatusIPFSBlock (blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateIPLDStatusIPFSBlock(dbTx, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getLatestCanonicalBlock (): Promise<BlockProgress> {
    const syncStatus = await this.getSyncStatus();
    assert(syncStatus);

    const latestCanonicalBlock = await this.getBlockProgress(syncStatus.latestCanonicalBlockHash);
    assert(latestCanonicalBlock);

    return latestCanonicalBlock;
  }

  async getLatestHooksProcessedBlock (): Promise<BlockProgress> {
    return this._baseIndexer.getLatestHooksProcessedBlock();
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
    await this.updateIPLDStatusMap(address, {});

    return this._baseIndexer.watchContract(address, kind, checkpoint, startingBlock);
  }

  async updateIPLDStatusMap (address: string, ipldStatus: IpldStatusInterface): Promise<void> {
    await this._baseIndexer.updateIPLDStatusMap(address, ipldStatus);
  }

  cacheContract (contract: Contract): void {
    return this._baseIndexer.cacheContract(contract);
  }

  async saveEventEntity (dbEvent: Event): Promise<Event> {
    return this._baseIndexer.saveEventEntity(dbEvent);
  }

  async getEventsByFilter (blockHash: string, contract?: string, name?: string): Promise<Array<Event>> {
    return this._baseIndexer.getEventsByFilter(blockHash, contract, name);
  }

  async isWatchedContract (address : string): Promise<Contract | undefined> {
    return this._baseIndexer.isWatchedContract(address);
  }

  getContractsByKind (kind: string): Contract[] {
    return this._baseIndexer.getContractsByKind(kind);
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._baseIndexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    return this._baseIndexer.getEventsInRange(fromBlockNumber, toBlockNumber, this._serverConfig.maxEventsBlockRange);
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._baseIndexer.getSyncStatus();
  }

  async getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any> {
    return this._baseIndexer.getBlocks(blockFilter);
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusIndexedBlock(blockHash, blockNumber, force);
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusChainHead(blockHash, blockNumber, force);
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusCanonicalBlock(blockHash, blockNumber, force);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._baseIndexer.getEvent(id);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._baseIndexer.getBlockProgress(blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgress>, options: FindManyOptions<BlockProgress>): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlockProgressEntities(where, options);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlocksAtHeight(height, isPruned);
  }

  async fetchBlockEvents (block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    return this._baseIndexer.fetchBlockEvents(block, this._fetchAndSaveEvents.bind(this));
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<Event>> {
    return this._baseIndexer.getBlockEvents(blockHash, where, queryOptions);
  }

  async removeUnknownEvents (block: BlockProgress): Promise<void> {
    return this._baseIndexer.removeUnknownEvents(Event, block);
  }

  async markBlocksAsPruned (blocks: BlockProgress[]): Promise<void> {
    return this._baseIndexer.markBlocksAsPruned(blocks);
  }

  async updateBlockProgress (block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    return this._baseIndexer.updateBlockProgress(block, lastProcessedEventIndex);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseIndexer.getAncestorAtDepth(blockHash, depth);
  }

  // Get latest block using eth client.
  async getLatestBlock (): Promise<BlockHeight> {
    const { block } = await this._ethClient.getBlockByHash();

    return block;
  }

  // Get full transaction data.
  async getFullTransaction (txHash: string): Promise<any> {
    return getFullTransaction(this._ethClient, txHash);
  }

  // Get contract interface for specified contract kind.
  getContractInterface (kind: string): ethers.utils.Interface | undefined {
    return this._contractMap.get(kind);
  }

  async _fetchAndSaveEvents ({ cid: blockCid, blockHash }: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    assert(blockHash);
    const transactionsPromise = this._ethClient.getBlockWithTransactions({ blockHash });
    const blockPromise = this._ethClient.getBlockByHash(blockHash);
    let logs: any[];

    if (this._serverConfig.filterLogs) {
      const watchedContracts = this._baseIndexer.getWatchedContracts();

      // TODO: Query logs by multiple contracts.
      const contractlogsPromises = watchedContracts.map((watchedContract): Promise<any> => this._ethClient.getLogs({
        blockHash,
        contract: watchedContract.address
      }));

      const contractlogs = await Promise.all(contractlogsPromises);

      // Flatten logs by contract and sort by index.
      logs = contractlogs.map(data => {
        return data.logs;
      }).flat()
        .sort((a, b) => {
          return a.index - b.index;
        });
    } else {
      ({ logs } = await this._ethClient.getLogs({ blockHash }));
    }

    let [
      { block },
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
    ] = await Promise.all([blockPromise, transactionsPromise]);

    const transactionMap = transactions.reduce((acc: {[key: string]: any}, transaction: {[key: string]: any}) => {
      acc[transaction.txHash] = transaction;
      return acc;
    }, {});

    const dbEvents: Array<DeepPartial<Event>> = [];

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
        const watchedContract = await this.isWatchedContract(contract);

        if (watchedContract) {
          const eventDetails = this.parseEventNameAndArgs(watchedContract.kind, logObj);
          eventName = eventDetails.eventName;
          eventInfo = eventDetails.eventInfo;
          extraInfo.eventSignature = eventDetails.eventSignature;
        }

        dbEvents.push({
          index: logIndex,
          txHash,
          contract,
          eventName,
          eventInfo: JSONbig.stringify(eventInfo),
          extraInfo: JSONbig.stringify(extraInfo),
          proof: JSONbig.stringify({
            data: JSONbig.stringify({
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

    const dbTx = await this._db.createTransactionRunner();

    try {
      block = {
        cid: blockCid,
        blockHash,
        blockNumber: block.number,
        blockTimestamp: block.timestamp,
        parentHash: block.parent.hash
      };

      const blockProgress = await this._db.saveEvents(dbTx, block, dbEvents);
      await dbTx.commitTransaction();

      return blockProgress;
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }
}
