//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
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
  UNKNOWN_EVENT_NAME,
  ServerConfig,
  JobQueue,
  Where,
  QueryOptions,
  updateStateForElementaryType,
  updateStateForMappingType,
  BlockHeight,
  StateKind,
  StateStatus
} from '@cerc-io/util';

import ERC721Artifacts from './artifacts/ERC721.json';
import { Database } from './database';
import { createInitialState, handleEvent, createStateDiff, createStateCheckpoint } from './hooks';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { StateSyncStatus } from './entity/StateSyncStatus';
import { BlockProgress } from './entity/BlockProgress';
import { State } from './entity/State';
import { TransferCount } from './entity/TransferCount';

const log = debug('vulcanize:indexer');
const JSONbigNative = JSONbig({ useNativeBigInt: true });

const KIND_ERC721 = 'ERC721';

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
      abi: ERC721ABI,
      storageLayout: ERC721StorageLayout
    } = ERC721Artifacts;

    assert(ERC721ABI);
    this._abiMap.set(KIND_ERC721, ERC721ABI);
    assert(ERC721StorageLayout);
    this._storageLayoutMap.set(KIND_ERC721, ERC721StorageLayout);
    this._contractMap.set(KIND_ERC721, new ethers.utils.Interface(ERC721ABI));
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

    const abi = this._abiMap.get(KIND_ERC721);
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

    const abi = this._abiMap.get(KIND_ERC721);
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

    const abi = this._abiMap.get(KIND_ERC721);
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

    const abi = this._abiMap.get(KIND_ERC721);
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

    const abi = this._abiMap.get(KIND_ERC721);
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

    const abi = this._abiMap.get(KIND_ERC721);
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

    const abi = this._abiMap.get(KIND_ERC721);
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

    const abi = this._abiMap.get(KIND_ERC721);
    assert(abi);

    const contract = new ethers.Contract(contractAddress, abi, this._ethProvider);
    const value = await contract.tokenURI(tokenId, { blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveTokenURI({ blockHash, blockNumber, contractAddress, tokenId, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    return result;
  }

  async getTransferCount (id: string, block: BlockHeight): Promise<TransferCount | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.getTransferCount(dbTx, { id, blockHash: block.hash, blockNumber: block.number });
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async saveOrUpdateTransferCount (transferCount: TransferCount): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.saveTransferCount(dbTx, transferCount);
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
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

    const storageLayout = this._storageLayoutMap.get(KIND_ERC721);
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

    const storageLayout = this._storageLayoutMap.get(KIND_ERC721);
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

  async _owners (blockHash: string, contractAddress: string, key0: bigint, diff = false): Promise<ValueResult> {
    const entity = await this._db._getOwners({ blockHash, contractAddress, key0 });
    if (entity) {
      log('_owners: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_owners: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const storageLayout = this._storageLayoutMap.get(KIND_ERC721);
    assert(storageLayout);

    const result = await this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      '_owners',
      key0
    );

    await this._db._saveOwners({ blockHash, blockNumber, contractAddress, key0, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    if (diff) {
      const stateUpdate = updateStateForMappingType({}, '_owners', [key0.toString()], result.value.toString());
      await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
    }

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

    const storageLayout = this._storageLayoutMap.get(KIND_ERC721);
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

  async _tokenApprovals (blockHash: string, contractAddress: string, key0: bigint, diff = false): Promise<ValueResult> {
    const entity = await this._db._getTokenApprovals({ blockHash, contractAddress, key0 });
    if (entity) {
      log('_tokenApprovals: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_tokenApprovals: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const storageLayout = this._storageLayoutMap.get(KIND_ERC721);
    assert(storageLayout);

    const result = await this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      '_tokenApprovals',
      key0
    );

    await this._db._saveTokenApprovals({ blockHash, blockNumber, contractAddress, key0, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    if (diff) {
      const stateUpdate = updateStateForMappingType({}, '_tokenApprovals', [key0.toString()], result.value.toString());
      await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
    }

    return result;
  }

  async _operatorApprovals (blockHash: string, contractAddress: string, key0: string, key1: string, diff = false): Promise<ValueResult> {
    const entity = await this._db._getOperatorApprovals({ blockHash, contractAddress, key0, key1 });
    if (entity) {
      log('_operatorApprovals: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_operatorApprovals: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const storageLayout = this._storageLayoutMap.get(KIND_ERC721);
    assert(storageLayout);

    const result = await this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      '_operatorApprovals',
      key0,
      key1
    );

    await this._db._saveOperatorApprovals({ blockHash, blockNumber, contractAddress, key0, key1, value: result.value, proof: JSONbigNative.stringify(result.proof) });

    if (diff) {
      const stateUpdate = updateStateForMappingType({}, '_operatorApprovals', [key0.toString(), key1.toString()], result.value.toString());
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

    const { eventName, eventInfo } = this._baseIndexer.parseEvent(logDescription);

    return {
      eventName,
      eventInfo,
      eventSignature: logDescription.signature
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

  async updateStateStatusMap (address: string, stateStatus: StateStatus): Promise<void> {
    await this._baseIndexer.updateStateStatusMap(address, stateStatus);
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
    return this._baseIndexer.getEventsInRange(fromBlockNumber, toBlockNumber);
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

  async fetchBlockWithEvents (block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    return this._baseIndexer.fetchBlockWithEvents(block, this._fetchAndSaveEvents.bind(this));
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

  async _fetchAndSaveEvents ({ cid: blockCid, blockHash }: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    assert(blockHash);
    const transactionsPromise = this._ethClient.getBlockWithTransactions({ blockHash });
    const blockPromise = this._ethClient.getBlockByHash(blockHash);
    let logs: any[];

    console.time('time:indexer#_fetchAndSaveEvents-fetch-logs');
    if (this._serverConfig.filterLogs) {
      const watchedContracts = this._baseIndexer.getWatchedContracts();
      const addresses = watchedContracts.map((watchedContract): string => {
        return watchedContract.address;
      });

      const logsResult = await this._ethClient.getLogs({
        blockHash,
        addresses
      });

      logs = logsResult.logs;
    } else {
      ({ logs } = await this._ethClient.getLogs({ blockHash }));
    }
    console.timeEnd('time:indexer#_fetchAndSaveEvents-fetch-logs');

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

    const dbTx = await this._db.createTransactionRunner();

    try {
      block = {
        cid: blockCid,
        blockHash,
        blockNumber: block.number,
        blockTimestamp: block.timestamp,
        parentHash: block.parent.hash
      };

      console.time('time:indexer#_fetchAndSaveEvents-save-block-events');
      const blockProgress = await this._db.saveBlockWithEvents(dbTx, block, dbEvents);
      await dbTx.commitTransaction();
      console.timeEnd('time:indexer#_fetchAndSaveEvents-save-block-events');

      return blockProgress;
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }
}
