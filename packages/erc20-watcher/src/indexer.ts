//
// Copyright 2021 Vulcanize, Inc.
//

/* eslint-disable @typescript-eslint/no-unused-vars */

import assert from 'assert';
import debug from 'debug';
import { JsonFragment } from '@ethersproject/abi';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import { BaseProvider } from '@ethersproject/providers';

import { EthClient } from '@cerc-io/ipld-eth-client';
import { MappingKey, StorageLayout } from '@cerc-io/solidity-mapper';
import {
  IndexerInterface,
  Indexer as BaseIndexer,
  ValueResult,
  JobQueue,
  Where,
  QueryOptions,
  ServerConfig,
  StateStatus,
  DatabaseInterface,
  Clients,
  StateKind
} from '@cerc-io/util';

import { Database, ENTITIES } from './database';
import { Event } from './entity/Event';
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from './utils';
import { SyncStatus } from './entity/SyncStatus';
import { StateSyncStatus } from './entity/StateSyncStatus';
import artifacts from './artifacts/ERC20.json';
import { BlockProgress } from './entity/BlockProgress';
import { Contract } from './entity/Contract';
import { State } from './entity/State';

const log = debug('vulcanize:indexer');
const JSONbigNative = JSONbig({ useNativeBigInt: true });

const ETH_CALL_MODE = 'eth_call';

const TRANSFER_EVENT = 'Transfer';
const APPROVAL_EVENT = 'Approval';

interface EventResult {
  blockHash: string;
  contract: string;
  event: {
    from?: string;
    to?: string;
    owner?: string;
    spender?: string;
    value?: bigint;
    __typename: string;
  }
  proof?: string;
}

export class Indexer implements IndexerInterface {
  _db: Database;
  _ethClient: EthClient;
  _ethProvider: BaseProvider;
  _baseIndexer: BaseIndexer;
  _serverConfig: ServerConfig;

  _abi: JsonFragment[];
  _storageLayout: StorageLayout;
  _contract: ethers.utils.Interface;
  _serverMode: string;

  constructor (serverConfig: ServerConfig, db: DatabaseInterface, clients: Clients, ethProvider: BaseProvider, jobQueue: JobQueue) {
    assert(db);
    assert(clients.ethClient);

    this._db = db as Database;
    this._ethClient = clients.ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._serverMode = serverConfig.mode;
    this._baseIndexer = new BaseIndexer(serverConfig, this._db, this._ethClient, this._ethProvider, jobQueue);

    const { abi, storageLayout } = artifacts;

    assert(abi);
    assert(storageLayout);

    this._abi = abi;
    this._storageLayout = storageLayout;

    this._contract = new ethers.utils.Interface(this._abi);
  }

  get serverConfig (): ServerConfig {
    return this._serverConfig;
  }

  get storageLayoutMap (): Map<string, StorageLayout> {
    return new Map([['ERC20', this._storageLayout]]);
  }

  async init (): Promise<void> {
    await this._baseIndexer.fetchContracts();
  }

  getResultEvent (event: Event): EventResult {
    const block = event.block;
    const eventFields = JSON.parse(event.eventInfo);

    return {
      blockHash: block.blockHash,
      contract: event.contract,
      event: {
        __typename: `${event.eventName}Event`,
        ...eventFields
      },
      // TODO: Return proof only if requested.
      proof: JSON.parse(event.proof)
    };
  }

  async totalSupply (blockHash: string, token: string): Promise<ValueResult> {
    let result: ValueResult;

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenTotalSupply(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_totalSupply');
    }

    // https://github.com/GoogleChromeLabs/jsbi/issues/30#issuecomment-521460510
    log(JSONbigNative.stringify(result, null, 2));

    return result;
  }

  async balanceOf (blockHash: string, token: string, owner: string): Promise<ValueResult> {
    const entity = await this._db.getBalance({ blockHash, token, owner });
    if (entity) {
      log('balanceOf: db hit');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('balanceOf: db miss, fetching from upstream server');
    let result: ValueResult;

    const { block: { number: blockNumber } } = await this._ethClient.getBlockByHash(blockHash);

    if (this._serverMode === ETH_CALL_MODE) {
      const contract = new ethers.Contract(token, this._abi, this._ethProvider);

      // eth_call doesn't support calling method by blockHash https://eth.wiki/json-rpc/API#the-default-block-parameter
      const value = await contract.balanceOf(owner, { blockTag: blockHash });

      result = {
        value: BigInt(value.toString())
      };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_balances', owner);
    }

    log(JSONbigNative.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveBalance({ blockHash, blockNumber, token, owner, value: BigInt(value), proof: JSONbigNative.stringify(proof) });

    return result;
  }

  async allowance (blockHash: string, token: string, owner: string, spender: string): Promise<ValueResult> {
    const entity = await this._db.getAllowance({ blockHash, token, owner, spender });
    if (entity) {
      log('allowance: db hit');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('allowance: db miss, fetching from upstream server');
    let result: ValueResult;

    const { block: { number: blockNumber } } = await this._ethClient.getBlockByHash(blockHash);

    if (this._serverMode === ETH_CALL_MODE) {
      const contract = new ethers.Contract(token, this._abi, this._ethProvider);
      const value = await contract.allowance(owner, spender, { blockTag: blockHash });

      result = {
        value: BigInt(value.toString())
      };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_allowances', owner, spender);
    }

    // log(JSONbig.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveAllowance({ blockHash, blockNumber, token, owner, spender, value: BigInt(value), proof: JSONbigNative.stringify(proof) });

    return result;
  }

  async name (blockHash: string, token: string): Promise<ValueResult> {
    let result: ValueResult;

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenName(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_name');
    }

    // log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async symbol (blockHash: string, token: string): Promise<ValueResult> {
    let result: ValueResult;

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenSymbol(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_symbol');
    }

    // log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async decimals (blockHash: string, token: string): Promise<ValueResult> {
    let result: ValueResult;

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenDecimals(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      // Not a state variable, uses hardcoded return value in contract function.
      // See https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol#L86
      throw new Error('Not implemented.');
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

  async processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void> {
    // TODO Implement
  }

  async processInitialState (contractAddress: string, blockHash: string): Promise<any> {
    // TODO: Call initial state hook.
    return undefined;
  }

  async processStateCheckpoint (contractAddress: string, blockHash: string): Promise<boolean> {
    // TODO: Call checkpoint hook.
    return false;
  }

  async processCheckpoint (blockHash: string): Promise<void> {
    // TODO Implement
  }

  async processCLICheckpoint (contractAddress: string, blockHash?: string): Promise<string | undefined> {
    // TODO Implement
    return undefined;
  }

  async getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<State | undefined> {
    // TODO Implement
    return undefined;
  }

  async getStateByCID (cid: string): Promise<State | undefined> {
    // TODO Implement
    return undefined;
  }

  async getStates (where: FindConditions<State>): Promise<State[]> {
    // TODO Implement
    return [];
  }

  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    // TODO Implement
  }

  async createDiff (contractAddress: string, blockHash: string, data: any): Promise<void> {
    // TODO Implement
  }

  async createCheckpoint (contractAddress: string, blockHash: string): Promise<string | undefined> {
    // TODO Implement
    return undefined;
  }

  async saveOrUpdateState (state: State): Promise<State> {
    return {} as State;
  }

  async removeStates (blockNumber: number, kind: StateKind): Promise<void> {
    // TODO Implement
  }

  getStateData (state: State): any {
    return this._baseIndexer.getStateData(state);
  }

  async triggerIndexingOnEvent (event: Event): Promise<void> {
    const { eventName, eventInfo, contract: token, block: { blockHash } } = event;
    const eventFields = JSON.parse(eventInfo);

    // What data we index depends on the kind of event.
    switch (eventName) {
      case TRANSFER_EVENT: {
        // On a transfer, balances for both parties change.
        // Therefore, trigger indexing for both sender and receiver.
        const { from, to } = eventFields;
        await this.balanceOf(blockHash, token, from);
        await this.balanceOf(blockHash, token, to);

        break;
      }
      case APPROVAL_EVENT: {
        // Update allowance for (owner, spender) combination.
        const { owner, spender } = eventFields;
        await this.allowance(blockHash, token, owner, spender);

        break;
      }
    }
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);
  }

  async processBlock (blockProgress: BlockProgress): Promise<void> {
    console.time('time:indexer#processBlock-init_state');
    // Call a function to create initial state for contracts.
    await this._baseIndexer.createInit(this, blockProgress.blockHash, blockProgress.blockNumber);
    console.time('time:indexer#processBlock-init_state');
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    const { topics, data } = logObj;
    const logDescription = this._contract.parseLog({ data, topics });

    const { eventName, eventInfo } = this._baseIndexer.parseEvent(logDescription);

    return { eventName, eventInfo };
  }

  async getStateSyncStatus (): Promise<StateSyncStatus | undefined> {
    return this._db.getStateSyncStatus();
  }

  async updateStateSyncStatusIndexedBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    // TODO Implement
    return {} as StateSyncStatus;
  }

  async updateStateSyncStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    // TODO Implement
    return {} as StateSyncStatus;
  }

  async getLatestStateIndexedBlock (): Promise<BlockProgress> {
    // TODO Implement
    return {} as BlockProgress;
  }

  async getLatestCanonicalBlock (): Promise<BlockProgress> {
    const syncStatus = await this.getSyncStatus();
    assert(syncStatus);

    const latestCanonicalBlock = await this.getBlockProgress(syncStatus.latestCanonicalBlockHash);
    assert(latestCanonicalBlock);

    return latestCanonicalBlock;
  }

  async getEventsByFilter (blockHash: string, contract: string, name?: string): Promise<Array<Event>> {
    return this._baseIndexer.getEventsByFilter(blockHash, contract, name);
  }

  isWatchedContract (address : string): Contract | undefined {
    return this._baseIndexer.isWatchedContract(address);
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

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._baseIndexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    return this._baseIndexer.getEventsInRange(fromBlockNumber, toBlockNumber);
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

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._baseIndexer.getSyncStatus();
  }

  async getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any> {
    return this._baseIndexer.getBlocks(blockFilter);
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

      console.time('time:indexer#_fetchAndSaveEvents-save-block-events');
      const blockProgress = await this._db.saveBlockWithEvents(dbTx, block, dbEvents);
      await dbTx.commitTransaction();
      console.timeEnd('time:indexer#_fetchAndSaveEvents-save-block-events');

      return [blockProgress, []];
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }
}
