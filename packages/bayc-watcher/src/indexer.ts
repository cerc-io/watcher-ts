//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import _ from 'lodash';

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
  getResultEvent
} from '@cerc-io/util';

import BoredApeYachtClubArtifacts from './artifacts/BoredApeYachtClub.json';
import { Database } from './database';
import { createInitialState, handleEvent, createStateDiff, createStateCheckpoint } from './hooks';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { StateSyncStatus } from './entity/StateSyncStatus';
import { BlockProgress } from './entity/BlockProgress';
import { State } from './entity/State';

import { SupportsInterface } from './entity/SupportsInterface';
import { BalanceOf } from './entity/BalanceOf';
import { OwnerOf } from './entity/OwnerOf';
import { GetApproved } from './entity/GetApproved';
import { IsApprovedForAll } from './entity/IsApprovedForAll';
import { Name } from './entity/Name';
import { Symbol } from './entity/Symbol';
import { TokenURI } from './entity/TokenURI';
import { TotalSupply } from './entity/TotalSupply';
import { TokenOfOwnerByIndex } from './entity/TokenOfOwnerByIndex';
import { TokenByIndex } from './entity/TokenByIndex';
import { BaseURI } from './entity/BaseURI';
import { Owner } from './entity/Owner';

const log = debug('vulcanize:indexer');
const JSONbigNative = JSONbig({ useNativeBigInt: true });

const KIND_BOREDAPEYACHTCLUB = 'Empty';

export class Indexer implements IndexerInterface {
  _db: Database
  _ethClient: EthClient
  _ethProvider: BaseProvider
  _baseIndexer: BaseIndexer
  _serverConfig: ServerConfig

  _abiMap: Map<string, JsonFragment[]>
  _storageLayoutMap: Map<string, StorageLayout>
  _contractMap: Map<string, ethers.utils.Interface>

  constructor (serverConfig: ServerConfig, db: Database, ethClient: EthClient, ethProvider: BaseProvider, jobQueue: JobQueue) {
    assert(db);
    assert(ethClient);

    this._db = db;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._baseIndexer = new BaseIndexer(this._serverConfig, this._db, this._ethClient, this._ethProvider, jobQueue);

    this._abiMap = new Map();
    this._storageLayoutMap = new Map();
    this._contractMap = new Map();

    const {
      abi: BoredApeYachtClubABI,
      storageLayout: BoredApeYachtClubStorageLayout
    } = BoredApeYachtClubArtifacts;

    assert(BoredApeYachtClubABI);
    this._abiMap.set(KIND_BOREDAPEYACHTCLUB, BoredApeYachtClubABI);
    assert(BoredApeYachtClubStorageLayout);
    this._storageLayoutMap.set(KIND_BOREDAPEYACHTCLUB, BoredApeYachtClubStorageLayout);
    this._contractMap.set(KIND_BOREDAPEYACHTCLUB, new ethers.utils.Interface(BoredApeYachtClubABI));

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

  async supportsInterface (blockHash: string, contractAddress: string, interfaceId: string): Promise<ValueResult> {
    const entity = await this._db.getSupportsInterface({ blockHash, contractAddress, interfaceId });
    if (entity) {
      log('supportsInterface: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('supportsInterface: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.supportsInterface(interfaceId, { blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveSupportsInterface({ blockHash, blockNumber, contractAddress, interfaceId, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async balanceOf (blockHash: string, contractAddress: string, owner: string): Promise<ValueResult> {
    const entity = await this._db.getBalanceOf({ blockHash, contractAddress, owner });
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

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    let value = await contract.balanceOf(owner, { blockTag: blockHash });
    value = value.toString();
    value = BigInt(value);

    const result: ValueResult = { value };

    await this._db.saveBalanceOf({ blockHash, blockNumber, contractAddress, owner, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async ownerOf (blockHash: string, contractAddress: string, tokenId: bigint): Promise<ValueResult> {
    const entity = await this._db.getOwnerOf({ blockHash, contractAddress, tokenId });
    if (entity) {
      log('ownerOf: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('ownerOf: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.ownerOf(tokenId, { blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveOwnerOf({ blockHash, blockNumber, contractAddress, tokenId, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async getApproved (blockHash: string, contractAddress: string, tokenId: bigint): Promise<ValueResult> {
    const entity = await this._db.getGetApproved({ blockHash, contractAddress, tokenId });
    if (entity) {
      log('getApproved: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('getApproved: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.getApproved(tokenId, { blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveGetApproved({ blockHash, blockNumber, contractAddress, tokenId, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async isApprovedForAll (blockHash: string, contractAddress: string, owner: string, operator: string): Promise<ValueResult> {
    const entity = await this._db.getIsApprovedForAll({ blockHash, contractAddress, owner, operator });
    if (entity) {
      log('isApprovedForAll: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('isApprovedForAll: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.isApprovedForAll(owner, operator, { blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveIsApprovedForAll({ blockHash, blockNumber, contractAddress, owner, operator, value: result.value, proof: JSONbigNative.stringify(result.proof) });

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

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
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

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.symbol({ blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveSymbol({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async tokenURI (blockHash: string, contractAddress: string, tokenId: bigint): Promise<ValueResult> {
    const entity = await this._db.getTokenURI({ blockHash, contractAddress, tokenId });
    if (entity) {
      log('tokenURI: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('tokenURI: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.tokenURI(tokenId, { blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveTokenURI({ blockHash, blockNumber, contractAddress, tokenId, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
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

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    let value = await contract.totalSupply({ blockTag: blockHash });
    value = value.toString();
    value = BigInt(value);

    const result: ValueResult = { value };

    await this._db.saveTotalSupply({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async tokenOfOwnerByIndex (blockHash: string, contractAddress: string, owner: string, index: bigint): Promise<ValueResult> {
    const entity = await this._db.getTokenOfOwnerByIndex({ blockHash, contractAddress, owner, index });
    if (entity) {
      log('tokenOfOwnerByIndex: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('tokenOfOwnerByIndex: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    let value = await contract.tokenOfOwnerByIndex(owner, index, { blockTag: blockHash });
    value = value.toString();
    value = BigInt(value);

    const result: ValueResult = { value };

    await this._db.saveTokenOfOwnerByIndex({ blockHash, blockNumber, contractAddress, owner, index, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async tokenByIndex (blockHash: string, contractAddress: string, index: bigint): Promise<ValueResult> {
    const entity = await this._db.getTokenByIndex({ blockHash, contractAddress, index });
    if (entity) {
      log('tokenByIndex: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('tokenByIndex: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    let value = await contract.tokenByIndex(index, { blockTag: blockHash });
    value = value.toString();
    value = BigInt(value);

    const result: ValueResult = { value };

    await this._db.saveTokenByIndex({ blockHash, blockNumber, contractAddress, index, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async baseURI (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const entity = await this._db.getBaseURI({ blockHash, contractAddress });
    if (entity) {
      log('baseURI: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('baseURI: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.baseURI({ blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveBaseURI({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async owner (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const entity = await this._db.getOwner({ blockHash, contractAddress });
    if (entity) {
      log('owner: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('owner: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const abi = this._abiMap.get(KIND_BOREDAPEYACHTCLUB);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.owner({ blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveOwner({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbigNative.stringify(result.proof) });

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

  // Method to be used by export-state CLI.
  async createCheckpoint (contractAddress: string, blockHash: string): Promise<string | undefined> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._baseIndexer.createCheckpoint(this, contractAddress, block);
  }

  // Method to be used by fill-state CLI.
  async createInit (blockHash: string, blockNumber: number): Promise<void> {
    // Create initial state for contracts.
    await this._baseIndexer.createInit(this, blockHash, blockNumber);
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
    // Call a function to create initial state for contracts.
    await this._baseIndexer.createInit(this, blockProgress.blockHash, blockProgress.blockNumber);
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

  async resetWatcherToBlock (blockNumber: number): Promise<void> {
    const entities = [
      SupportsInterface,
      BalanceOf,
      OwnerOf,
      GetApproved,
      IsApprovedForAll,
      Name,
      Symbol,
      TokenURI,
      TotalSupply,
      TokenOfOwnerByIndex,
      TokenByIndex,
      BaseURI,
      Owner,
    ];
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
