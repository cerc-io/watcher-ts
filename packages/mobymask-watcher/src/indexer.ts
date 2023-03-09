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
import { EthClient } from '@cerc-io/ipld-eth-client';
import { MappingKey, StorageLayout } from '@cerc-io/solidity-mapper';
import {
  Indexer as BaseIndexer,
  IndexerInterface,
  ValueResult,
  ServerConfig,
  JobQueue,
  Where,
  QueryOptions,
  updateStateForElementaryType,
  updateStateForMappingType,
  BlockHeight,
  StateKind,
  StateStatus,
  getFullTransaction,
  ResultEvent,
  getResultEvent,
  DatabaseInterface,
  Clients
} from '@cerc-io/util';

import PhisherRegistryArtifacts from './artifacts/PhisherRegistry.json';
import { Database, ENTITIES } from './database';
import { createInitialState, handleEvent, createStateDiff, createStateCheckpoint } from './hooks';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { StateSyncStatus } from './entity/StateSyncStatus';
import { BlockProgress } from './entity/BlockProgress';
import { State } from './entity/State';
import { IsMember } from './entity/IsMember';
import { IsPhisher } from './entity/IsPhisher';
import { IsRevoked } from './entity/IsRevoked';
import { _Owner } from './entity/_Owner';
import { MultiNonce } from './entity/MultiNonce';

const log = debug('vulcanize:indexer');
const JSONbigNative = JSONbig({ useNativeBigInt: true });

export const KIND_PHISHERREGISTRY = 'PhisherRegistry';

export class Indexer implements IndexerInterface {
  _db: Database;
  _ethClient: EthClient;
  _ethProvider: JsonRpcProvider;
  _baseIndexer: BaseIndexer;
  _serverConfig: ServerConfig;

  _abiMap: Map<string, JsonFragment[]>;
  _storageLayoutMap: Map<string, StorageLayout>;
  _contractMap: Map<string, ethers.utils.Interface>;

  constructor (serverConfig: ServerConfig, db: DatabaseInterface, clients: Clients, ethProvider: JsonRpcProvider, jobQueue: JobQueue) {
    assert(db);
    assert(clients.ethClient);

    this._db = db as Database;
    this._ethClient = clients.ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._baseIndexer = new BaseIndexer(this._serverConfig, this._db, this._ethClient, this._ethProvider, jobQueue);

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

  get storageLayoutMap (): Map<string, StorageLayout> {
    return this._storageLayoutMap;
  }

  async init (): Promise<void> {
    await this._baseIndexer.fetchContracts();
    await this._baseIndexer.fetchStateStatus();
  }

  getResultEvent (event: Event): ResultEvent {
    return getResultEvent(event);
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
      proof: result.proof ? JSONbigNative.stringify(result.proof) : null
    } as any;
  }

  async getStorageValue (storageLayout: StorageLayout, blockHash: string, contractAddress: string, variable: string, ...mappingKeys: MappingKey[]): Promise<ValueResult> {
    return this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      variable,
      ...mappingKeys
    );
  }

  async getEntitiesForBlock (blockHash: string, tableName: string): Promise<any[]> {
    return this._db.getEntitiesForBlock(blockHash, tableName);
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
    console.time('time:indexer#processCanonicalBlock-finalize_auto_diffs');
    // Finalize staged diff blocks if any.
    await this._baseIndexer.finalizeDiffStaged(blockHash);
    console.timeEnd('time:indexer#processCanonicalBlock-finalize_auto_diffs');

    // Call custom stateDiff hook.
    await createStateDiff(this, blockHash);
  }

  async processCheckpoint (blockHash: string): Promise<void> {
    // Return if checkpointInterval is <= 0.
    const checkpointInterval = this._serverConfig.checkpointInterval;
    if (checkpointInterval <= 0) return;

    console.time('time:indexer#processCheckpoint-checkpoint');
    await this._baseIndexer.processCheckpoint(this, blockHash, checkpointInterval);
    console.timeEnd('time:indexer#processCheckpoint-checkpoint');
  }

  async processCLICheckpoint (contractAddress: string, blockHash?: string): Promise<string | undefined> {
    return this._baseIndexer.processCLICheckpoint(this, contractAddress, blockHash);
  }

  async getPrevState (blockHash: string, contractAddress: string, kind?: string): Promise<State | undefined> {
    return this._db.getPrevState(blockHash, contractAddress, kind);
  }

  async getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<State | undefined> {
    return this._db.getLatestState(contractAddress, kind, blockNumber);
  }

  async getStatesByHash (blockHash: string): Promise<State[]> {
    return this._baseIndexer.getStatesByHash(blockHash);
  }

  async getStateByCID (cid: string): Promise<State | undefined> {
    return this._baseIndexer.getStateByCID(cid);
  }

  async getStates (where: FindConditions<State>): Promise<State[]> {
    return this._db.getStates(where);
  }

  getStateData (state: State): any {
    return this._baseIndexer.getStateData(state);
  }

  // Method used to create auto diffs (diff_staged).
  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    console.time('time:indexer#createDiffStaged-auto_diff');
    await this._baseIndexer.createDiffStaged(contractAddress, blockHash, data);
    console.timeEnd('time:indexer#createDiffStaged-auto_diff');
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

  // Method to be used by export-state CLI.
  async createCheckpoint (contractAddress: string, blockHash: string): Promise<string | undefined> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._baseIndexer.createCheckpoint(this, contractAddress, block);
  }

  async saveOrUpdateState (state: State): Promise<State> {
    return this._baseIndexer.saveOrUpdateState(state);
  }

  async removeStates (blockNumber: number, kind: StateKind): Promise<void> {
    await this._baseIndexer.removeStates(blockNumber, kind);
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

  async processBlock (blockProgress: BlockProgress): Promise<void> {
    console.time('time:indexer#processBlock-init_state');
    // Call a function to create initial state for contracts.
    await this._baseIndexer.createInit(this, blockProgress.blockHash, blockProgress.blockNumber);
    console.timeEnd('time:indexer#processBlock-init_state');
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    const { topics, data } = logObj;

    const contract = this._contractMap.get(kind);
    assert(contract);

    const logDescription = contract.parseLog({ data, topics });

    const { eventName, eventInfo, eventSignature } = this._baseIndexer.parseEvent(logDescription);

    return {
      eventName,
      eventInfo,
      eventSignature
    };
  }

  async getStateSyncStatus (): Promise<StateSyncStatus | undefined> {
    return this._db.getStateSyncStatus();
  }

  async updateStateSyncStatusIndexedBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateStateSyncStatusIndexedBlock(dbTx, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateStateSyncStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateStateSyncStatusCheckpointBlock(dbTx, blockNumber, force);
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

  async getLatestStateIndexedBlock (): Promise<BlockProgress> {
    return this._baseIndexer.getLatestStateIndexedBlock();
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
    return this._baseIndexer.watchContract(address, kind, checkpoint, startingBlock);
  }

  updateStateStatusMap (address: string, stateStatus: StateStatus): void {
    this._baseIndexer.updateStateStatusMap(address, stateStatus);
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

  isWatchedContract (address : string): Contract | undefined {
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

  async saveBlockAndFetchEvents (block: DeepPartial<BlockProgress>): Promise<[BlockProgress, DeepPartial<Event>[]]> {
    return this._saveBlockAndFetchEvents(block);
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
  async getFullTransaction (txHash: string, blockNumber: number): Promise<any> {
    return getFullTransaction(this._ethClient, txHash, blockNumber);
  }

  // Get contract interface for specified contract kind.
  getContractInterface (kind: string): ethers.utils.Interface | undefined {
    return this._contractMap.get(kind);
  }

  async resetWatcherToBlock (blockNumber: number): Promise<void> {
    const entities = [...ENTITIES];
    await this._baseIndexer.resetWatcherToBlock(blockNumber, entities);
  }

  async _saveBlockAndFetchEvents ({
    cid: blockCid,
    blockHash,
    blockNumber,
    blockTimestamp,
    parentHash
  }: DeepPartial<BlockProgress>): Promise<[BlockProgress, DeepPartial<Event>[]]> {
    assert(blockHash);
    assert(blockNumber);

    const dbEvents = await this._baseIndexer.fetchEvents(blockHash, blockNumber, this.parseEventNameAndArgs.bind(this));

    const dbTx = await this._db.createTransactionRunner();
    try {
      const block = {
        cid: blockCid,
        blockHash,
        blockNumber,
        blockTimestamp,
        parentHash
      };

      console.time(`time:indexer#_saveBlockAndFetchEvents-db-save-${blockNumber}`);
      const blockProgress = await this._db.saveBlockWithEvents(dbTx, block, dbEvents);
      await dbTx.commitTransaction();
      console.timeEnd(`time:indexer#_saveBlockAndFetchEvents-db-save-${blockNumber}`);

      return [blockProgress, []];
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }
}
