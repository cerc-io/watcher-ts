//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import _ from 'lodash';
import { SelectionNode } from 'graphql';

import { JsonFragment } from '@ethersproject/abi';
import { BaseProvider } from '@ethersproject/providers';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { StorageLayout, MappingKey } from '@cerc-io/solidity-mapper';
import {
  Indexer as BaseIndexer,
  ValueResult,
  UNKNOWN_EVENT_NAME,
  ServerConfig,
  updateStateForElementaryType,
  JobQueue,
  Where,
  QueryOptions,
  BlockHeight,
  StateKind,
  IndexerInterface,
  StateStatus
} from '@cerc-io/util';
import { GraphWatcher } from '@cerc-io/graph-node';

import { Database } from './database';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { StateSyncStatus } from './entity/StateSyncStatus';
import { BlockProgress } from './entity/BlockProgress';
import { State } from './entity/State';
import Example1Artifacts from './artifacts/Example.json';
import { createInitialState, handleEvent, createStateDiff, createStateCheckpoint } from './hooks';
import { Author } from './entity/Author';
import { Blog } from './entity/Blog';
import { Category } from './entity/Category';

const log = debug('vulcanize:indexer');
const JSONbigNative = JSONbig({ useNativeBigInt: true });

const KIND_EXAMPLE1 = 'Example1';

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

export class Indexer implements IndexerInterface {
  _db: Database
  _ethClient: EthClient
  _ethProvider: BaseProvider
  _baseIndexer: BaseIndexer
  _serverConfig: ServerConfig
  _graphWatcher: GraphWatcher;

  _abiMap: Map<string, JsonFragment[]>
  _storageLayoutMap: Map<string, StorageLayout>
  _contractMap: Map<string, ethers.utils.Interface>

  _entityTypesMap: Map<string, { [key: string]: string }>
  _relationsMap: Map<any, { [key: string]: any }>

  _subgraphStateMap: Map<string, any>

  constructor (serverConfig: ServerConfig, db: Database, ethClient: EthClient, ethProvider: BaseProvider, jobQueue: JobQueue, graphWatcher: GraphWatcher) {
    assert(db);
    assert(ethClient);

    this._db = db;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._baseIndexer = new BaseIndexer(this._serverConfig, this._db, this._ethClient, this._ethProvider, jobQueue);
    this._graphWatcher = graphWatcher;

    this._abiMap = new Map();
    this._storageLayoutMap = new Map();
    this._contractMap = new Map();

    const {
      abi: Example1ABI,
      storageLayout: Example1StorageLayout
    } = Example1Artifacts;

    assert(Example1ABI);
    assert(Example1StorageLayout);
    this._abiMap.set(KIND_EXAMPLE1, Example1ABI);
    this._storageLayoutMap.set(KIND_EXAMPLE1, Example1StorageLayout);
    this._contractMap.set(KIND_EXAMPLE1, new ethers.utils.Interface(Example1ABI));

    this._entityTypesMap = new Map();
    this._populateEntityTypesMap();

    this._relationsMap = new Map();
    this._populateRelationsMap();

    this._subgraphStateMap = new Map();
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
    const block = event.block;
    const eventFields = JSONbigNative.parse(event.eventInfo);
    const { tx, eventSignature } = JSONbigNative.parse(event.extraInfo);

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

  async getMethod (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const entity = await this._db.getGetMethod({ blockHash, contractAddress });
    if (entity) {
      log('getMethod: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('getMethod: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_EXAMPLE1);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.getMethod({ blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveGetMethod({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async _test (blockHash: string, contractAddress: string, diff = false): Promise<ValueResult> {
    const entity = await this._db._getTest({ blockHash, contractAddress });
    if (entity) {
      log('_test: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_test: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const storageLayout = this._storageLayoutMap.get(KIND_EXAMPLE1);
    assert(storageLayout);

    const result = await this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      '_test'
    );

    await this._db._saveTest({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    if (diff) {
      const stateUpdate = updateStateForElementaryType({}, '_test', result.value.toString());
      await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
    }

    return result;
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

  async processInitialState (contractAddress: string, blockHash: string): Promise<any> {
    // Call initial state hook.
    return createInitialState(this, contractAddress, blockHash);
  }

  async processStateCheckpoint (contractAddress: string, blockHash: string): Promise<boolean> {
    // Call checkpoint hook.
    return createStateCheckpoint(this, contractAddress, blockHash);
  }

  async processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void> {
    // Finalize staged diff blocks if any.
    await this._baseIndexer.finalizeDiffStaged(blockHash);

    // Call custom stateDiff hook.
    await createStateDiff(this, blockHash);

    this._graphWatcher.pruneEntityCacheFrothyBlocks(blockHash, blockNumber);
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

  async saveOrUpdateState (state: State): Promise<State> {
    return this._baseIndexer.saveOrUpdateState(state);
  }

  async removeStates (blockNumber: number, kind: StateKind): Promise<void> {
    await this._baseIndexer.removeStates(blockNumber, kind);
  }

  async getSubgraphEntity<Entity> (
    entity: new () => Entity,
    id: string,
    block: BlockHeight,
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<any> {
    const data = await this._graphWatcher.getEntity(entity, id, this._relationsMap, block, selections);

    return data;
  }

  async triggerIndexingOnEvent (event: Event): Promise<void> {
    const resultEvent = this.getResultEvent(event);

    // Call subgraph handler for event.
    await this._graphWatcher.handleEvent(resultEvent);

    // Call custom hook function for indexing on event.
    await handleEvent(this, resultEvent);
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);
  }

  async processBlock (blockProgress: BlockProgress): Promise<void> {
    // Call a function to create initial state for contracts.
    await this._baseIndexer.createInit(this, blockProgress.blockHash, blockProgress.blockNumber);

    this._graphWatcher.updateEntityCacheFrothyBlocks(blockProgress);
  }

  async processBlockAfterEvents (blockHash: string): Promise<void> {
    // Call subgraph handler for block.
    await this._graphWatcher.handleBlock(blockHash);

    // Persist subgraph state to the DB.
    await this.dumpSubgraphState(blockHash);
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
    return this._baseIndexer.saveBlockAndFetchEvents(block, this._saveBlockAndFetchEvents.bind(this));
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

  getEntityTypesMap (): Map<string, { [key: string]: string }> {
    return this._entityTypesMap;
  }

  getRelationsMap (): Map<any, { [key: string]: any }> {
    return this._relationsMap;
  }

  updateSubgraphState (contractAddress: string, data: any): void {
    // Update the subgraph state for a given contract.
    const oldData = this._subgraphStateMap.get(contractAddress);
    const updatedData = _.merge(oldData, data);
    this._subgraphStateMap.set(contractAddress, updatedData);
  }

  async dumpSubgraphState (blockHash: string, isStateFinalized = false): Promise<void> {
    // Create a diff for each contract in the subgraph state map.
    const createDiffPromises = Array.from(this._subgraphStateMap.entries())
      .map(([contractAddress, data]): Promise<void> => {
        if (isStateFinalized) {
          return this.createDiff(contractAddress, blockHash, data);
        }

        return this.createDiffStaged(contractAddress, blockHash, data);
      });

    await Promise.all(createDiffPromises);

    // Reset the subgraph state map.
    this._subgraphStateMap.clear();
  }

  _populateEntityTypesMap (): void {
    this._entityTypesMap.set(
      'Author',
      {
        id: 'ID',
        blogCount: 'BigInt',
        name: 'String',
        rating: 'BigDecimal',
        paramInt: 'Int',
        paramBigInt: 'BigInt',
        paramBytes: 'Bytes'
      }
    );

    this._entityTypesMap.set(
      'Blog',
      {
        id: 'ID',
        kind: 'BlogKind',
        isActive: 'Boolean',
        reviews: 'BigInt',
        author: 'Author',
        categories: 'Category'
      }
    );

    this._entityTypesMap.set(
      'Category',
      {
        id: 'ID',
        name: 'String',
        count: 'BigInt'
      }
    );
  }

  _populateRelationsMap (): void {
    // Needs to be generated by codegen.
    this._relationsMap.set(Author, {
      blogs: {
        entity: Blog,
        isDerived: true,
        isArray: true,
        field: 'author'
      }
    });

    this._relationsMap.set(Blog, {
      author: {
        entity: Author,
        isDerived: false,
        isArray: false
      },
      categories: {
        entity: Category,
        isDerived: false,
        isArray: true
      }
    });
  }

  async _saveBlockAndFetchEvents ({
    cid: blockCid,
    blockHash,
    blockNumber,
    blockTimestamp,
    parentHash
  }: DeepPartial<BlockProgress>): Promise<[BlockProgress, DeepPartial<Event>[]]> {
    assert(blockHash);

    const dbEvents = await this._baseIndexer.fetchEvents(blockHash, this.parseEventNameAndArgs.bind(this));

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
