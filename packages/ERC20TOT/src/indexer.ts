//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial, FindConditions, FindManyOptions, ObjectLiteral } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';

import { JsonFragment } from '@ethersproject/abi';
import { BaseProvider } from '@ethersproject/providers';
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
  StateKind,
  StateStatus,
  ResultEvent,
  getResultEvent,
  DatabaseInterface,
  Clients
} from '@cerc-io/util';

import ERC20Artifacts from './artifacts/ERC20.json';
import { Database, ENTITIES } from './database';
import { createInitialState, handleEvent, createStateDiff, createStateCheckpoint } from './hooks';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { StateSyncStatus } from './entity/StateSyncStatus';
import { BlockProgress } from './entity/BlockProgress';
import { State } from './entity/State';

const log = debug('vulcanize:indexer');
const JSONbigNative = JSONbig({ useNativeBigInt: true });

const KIND_ERC20 = 'ERC20';

export class Indexer implements IndexerInterface {
  _db: Database;
  _ethClient: EthClient;
  _ethProvider: BaseProvider;
  _baseIndexer: BaseIndexer;
  _serverConfig: ServerConfig;

  _abiMap: Map<string, JsonFragment[]>;
  _storageLayoutMap: Map<string, StorageLayout>;
  _contractMap: Map<string, ethers.utils.Interface>;

  constructor (serverConfig: ServerConfig, db: DatabaseInterface, clients: Clients, ethProvider: BaseProvider, jobQueue: JobQueue) {
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

    const { abi: ERC20ABI, storageLayout: ERC20StorageLayout } = ERC20Artifacts;

    assert(ERC20ABI);
    this._abiMap.set(KIND_ERC20, ERC20ABI);
    assert(ERC20StorageLayout);
    this._storageLayoutMap.set(KIND_ERC20, ERC20StorageLayout);
    this._contractMap.set(KIND_ERC20, new ethers.utils.Interface(ERC20ABI));
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

  async totalSupply (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const entity = await this._db.getTotalSupply({ blockHash, contractAddress });
    if (entity) {
      log('totalSupply: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('totalSupply: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_ERC20);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    let value = await contract.totalSupply({ blockTag: blockHash });
    value = value.toString();
    value = BigInt(value);

    const result: ValueResult = { value };

    await this._db.saveTotalSupply({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async balanceOf (blockHash: string, contractAddress: string, account: string): Promise<ValueResult> {
    const entity = await this._db.getBalanceOf({ blockHash, contractAddress, account });
    if (entity) {
      log('balanceOf: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('balanceOf: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_ERC20);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    let value = await contract.balanceOf(account, { blockTag: blockHash });
    value = value.toString();
    value = BigInt(value);

    const result: ValueResult = { value };

    await this._db.saveBalanceOf({ blockHash, blockNumber, contractAddress, account, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async allowance (blockHash: string, contractAddress: string, owner: string, spender: string): Promise<ValueResult> {
    const entity = await this._db.getAllowance({ blockHash, contractAddress, owner, spender });
    if (entity) {
      log('allowance: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('allowance: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_ERC20);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    let value = await contract.allowance(owner, spender, { blockTag: blockHash });
    value = value.toString();
    value = BigInt(value);

    const result: ValueResult = { value };

    await this._db.saveAllowance({ blockHash, blockNumber, contractAddress, owner, spender, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async name (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const entity = await this._db.getName({ blockHash, contractAddress });
    if (entity) {
      log('name: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('name: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_ERC20);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.name({ blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveName({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async symbol (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const entity = await this._db.getSymbol({ blockHash, contractAddress });
    if (entity) {
      log('symbol: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('symbol: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_ERC20);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.symbol({ blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveSymbol({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async decimals (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const entity = await this._db.getDecimals({ blockHash, contractAddress });
    if (entity) {
      log('decimals: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('decimals: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_ERC20);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.decimals({ blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveDecimals({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async _balances (blockHash: string, contractAddress: string, key0: string, diff = false): Promise<ValueResult> {
    const entity = await this._db._getBalances({ blockHash, contractAddress, key0 });
    if (entity) {
      log('_balances: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_balances: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const storageLayout = this._storageLayoutMap.get(KIND_ERC20);
    assert(storageLayout);

    const result = await this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      '_balances',
      key0
    );

    await this._db._saveBalances({ blockHash, blockNumber, contractAddress, key0, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    if (diff) {
      const stateUpdate = updateStateForMappingType({}, '_balances', [key0.toString()], result.value.toString());
      await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
    }

    return result;
  }

  async _allowances (blockHash: string, contractAddress: string, key0: string, key1: string, diff = false): Promise<ValueResult> {
    const entity = await this._db._getAllowances({ blockHash, contractAddress, key0, key1 });
    if (entity) {
      log('_allowances: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_allowances: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const storageLayout = this._storageLayoutMap.get(KIND_ERC20);
    assert(storageLayout);

    const result = await this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      '_allowances',
      key0,
      key1
    );

    await this._db._saveAllowances({ blockHash, blockNumber, contractAddress, key0, key1, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    if (diff) {
      const stateUpdate = updateStateForMappingType({}, '_allowances', [key0.toString(), key1.toString()], result.value.toString());
      await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
    }

    return result;
  }

  async _totalSupply (blockHash: string, contractAddress: string, diff = false): Promise<ValueResult> {
    const entity = await this._db._getTotalSupply({ blockHash, contractAddress });
    if (entity) {
      log('_totalSupply: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_totalSupply: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const storageLayout = this._storageLayoutMap.get(KIND_ERC20);
    assert(storageLayout);

    const result = await this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      '_totalSupply'
    );

    await this._db._saveTotalSupply({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    if (diff) {
      const stateUpdate = updateStateForElementaryType({}, '_totalSupply', result.value.toString());
      await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
    }

    return result;
  }

  async _name (blockHash: string, contractAddress: string, diff = false): Promise<ValueResult> {
    const entity = await this._db._getName({ blockHash, contractAddress });
    if (entity) {
      log('_name: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_name: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const storageLayout = this._storageLayoutMap.get(KIND_ERC20);
    assert(storageLayout);

    const result = await this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      '_name'
    );

    await this._db._saveName({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    if (diff) {
      const stateUpdate = updateStateForElementaryType({}, '_name', result.value.toString());
      await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
    }

    return result;
  }

  async _symbol (blockHash: string, contractAddress: string, diff = false): Promise<ValueResult> {
    const entity = await this._db._getSymbol({ blockHash, contractAddress });
    if (entity) {
      log('_symbol: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_symbol: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const storageLayout = this._storageLayoutMap.get(KIND_ERC20);
    assert(storageLayout);

    const result = await this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      '_symbol'
    );

    await this._db._saveSymbol({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    if (diff) {
      const stateUpdate = updateStateForElementaryType({}, '_symbol', result.value.toString());
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

  async processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void> {
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
    const syncStatus = this._baseIndexer.updateSyncStatusCanonicalBlock(blockHash, blockNumber, force);

    return syncStatus;
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
    await this._baseIndexer.markBlocksAsPruned(blocks);
  }

  async updateBlockProgress (block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    return this._baseIndexer.updateBlockProgress(block, lastProcessedEventIndex);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseIndexer.getAncestorAtDepth(blockHash, depth);
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
