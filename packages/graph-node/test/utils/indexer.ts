/* eslint-disable @typescript-eslint/no-unused-vars */

import assert from 'assert';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import { ethers } from 'ethers';

import {
  IndexerInterface,
  BlockProgressInterface,
  EventInterface,
  SyncStatusInterface,
  ServerConfig,
  ValueResult,
  ContractInterface,
  StateStatus,
  StateSyncStatusInterface,
  StateInterface,
  getResultEvent,
  ResultEvent,
  StateKind,
  EthClient,
  UpstreamConfig,
  EthFullTransaction,
  EthFullBlock
} from '@cerc-io/util';
import { GetStorageAt, getStorageValue, MappingKey, StorageLayout } from '@cerc-io/solidity-mapper';

export class Indexer implements IndexerInterface {
  _getStorageAt: GetStorageAt;
  _storageLayoutMap: Map<string, StorageLayout> = new Map();
  _contractMap: Map<string, ethers.utils.Interface> = new Map();

  eventSignaturesMap: Map<string, string[]> = new Map();

  constructor (ethClient: EthClient, storageLayoutMap?: Map<string, StorageLayout>) {
    this._getStorageAt = ethClient.getStorageAt.bind(ethClient);

    if (storageLayoutMap) {
      this._storageLayoutMap = storageLayoutMap;
    }
  }

  get serverConfig () {
    return {} as ServerConfig;
  }

  get upstreamConfig () {
    return {} as UpstreamConfig;
  }

  get storageLayoutMap (): Map<string, StorageLayout> {
    return this._storageLayoutMap;
  }

  get contractMap (): Map<string, ethers.utils.Interface> {
    return this._contractMap;
  }

  async init (): Promise<void> {
    return undefined;
  }

  getResultEvent (event: EventInterface): ResultEvent {
    return getResultEvent(event);
  }

  async getStorageValue (storageLayout: StorageLayout, blockHash: string, contractAddress: string, variable: string, ...mappingKeys: MappingKey[]): Promise<ValueResult> {
    return getStorageValue(
      storageLayout,
      this._getStorageAt,
      blockHash,
      contractAddress,
      variable,
      ...mappingKeys
    );
  }

  async getEntitiesForBlock (blockHash: string, tableName: string): Promise<any[]> {
    return [];
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined> {
    assert(blockHash);

    return undefined;
  }

  async getEvent (id: string): Promise<EventInterface | undefined> {
    assert(id);

    return undefined;
  }

  async getEvents (options: FindManyOptions<EventInterface>): Promise<Array<EventInterface>> {
    assert(options);

    return [];
  }

  async getSyncStatus (): Promise<SyncStatusInterface | undefined> {
    return undefined;
  }

  async getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any> {
    assert(blockFilter);

    return undefined;
  }

  async getBlockByHash (blockHash?: string): Promise<{ block: any }> {
    return { block: undefined };
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]> {
    assert(height);
    assert(isPruned);

    return [];
  }

  async getBlockEvents (blockHash: string): Promise<Array<EventInterface>> {
    assert(blockHash);

    return [];
  }

  async getAncestorAtHeight (blockHash: string, height: number): Promise<string> {
    assert(blockHash);
    assert(height);

    return '';
  }

  async fetchAndSaveFilteredEventsAndBlocks (startBlock: number, endBlock: number): Promise<{
    blockProgress: BlockProgressInterface;
    events: DeepPartial<EventInterface>[];
    ethFullBlock: EthFullBlock;
    ethFullTransactions: EthFullTransaction[];
  }[]> {
    assert(startBlock);
    assert(endBlock);

    return [];
  }

  async fetchEventsForContracts (blockHash: string, blockNumber: number, addresses: string[]): Promise<DeepPartial<EventInterface>[]> {
    assert(blockHash);
    assert(blockNumber);
    assert(addresses);

    return [];
  }

  async saveBlockAndFetchEvents (block: BlockProgressInterface): Promise<[
    BlockProgressInterface,
    DeepPartial<EventInterface>[],
    EthFullTransaction[]
  ]> {
    return [block, [], []];
  }

  async removeUnknownEvents (block: BlockProgressInterface): Promise<void> {
    assert(block);
  }

  async updateBlockProgress (block: BlockProgressInterface, lastProcessedEventIndex: number): Promise<BlockProgressInterface> {
    assert(block);
    assert(lastProcessedEventIndex);

    return block;
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    assert(blockHash);
    assert(blockNumber);

    return {} as SyncStatusInterface;
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface> {
    assert(blockNumber);
    assert(blockHash);
    assert(force);

    return {} as SyncStatusInterface;
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface> {
    assert(blockNumber);
    assert(blockHash);
    assert(force);

    return {} as SyncStatusInterface;
  }

  async updateSyncStatusProcessedBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface> {
    assert(blockNumber);
    assert(blockHash);
    assert(force);

    return {} as SyncStatusInterface;
  }

  async updateSyncStatusIndexingError (hasIndexingError: boolean): Promise<SyncStatusInterface | undefined> {
    assert(hasIndexingError);

    return undefined;
  }

  async updateSyncStatus (syncStatus: SyncStatusInterface): Promise<SyncStatusInterface> {
    assert(syncStatus);

    return {} as SyncStatusInterface;
  }

  async markBlocksAsPruned (blocks: BlockProgressInterface[]): Promise<void> {
    assert(blocks);

    return undefined;
  }

  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    assert(contractAddress);
    assert(blockHash);
    assert(data);
  }

  getEntityTypesMap (): Map<string, { [key: string]: string; }> {
    return new Map();
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgressInterface>, options: FindManyOptions<BlockProgressInterface>): Promise<BlockProgressInterface[]> {
    assert(where);
    assert(options);

    return [];
  }

  async saveEventEntity (dbEvent: EventInterface): Promise<EventInterface> {
    return dbEvent;
  }

  async saveEvents (dbEvents: EventInterface[]): Promise<void> {
    assert(dbEvents);
  }

  async processEvent (event: EventInterface): Promise<void> {
    assert(event);
  }

  async getStateSyncStatus (): Promise<StateSyncStatusInterface | undefined> {
    return undefined;
  }

  async updateStateSyncStatusIndexedBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface | undefined> {
    return undefined;
  }

  async updateStateSyncStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface> {
    return {} as StateSyncStatusInterface;
  }

  async getLatestCanonicalBlock (): Promise<BlockProgressInterface | undefined> {
    return undefined;
  }

  isContractAddressWatched (address : string): ContractInterface[] | undefined {
    return undefined;
  }

  getWatchedContracts (): ContractInterface[] {
    return [];
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
    return undefined;
  }

  async removeContract (address: string, kind: string): Promise<void> {
    return undefined;
  }

  async processBlock (blockProgress: BlockProgressInterface): Promise<void> {
    return undefined;
  }

  async processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void> {
    return undefined;
  }

  async processCheckpoint (blockHash: string): Promise<void> {
    return undefined;
  }

  async processCLICheckpoint (contractAddress: string, blockHash?: string): Promise<string | undefined> {
    return undefined;
  }

  async getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<StateInterface | undefined> {
    return undefined;
  }

  async getStateByCID (cid: string): Promise<StateInterface | undefined> {
    return undefined;
  }

  async getStates (where: FindConditions<StateInterface>): Promise<StateInterface[]> {
    return [];
  }

  async createDiff (contractAddress: string, blockHash: string, data: any): Promise<void> {
    return undefined;
  }

  async createCheckpoint (contractAddress: string, blockHash: string): Promise<string | undefined> {
    return undefined;
  }

  async getLatestStateIndexedBlock (): Promise<BlockProgressInterface> {
    return {} as BlockProgressInterface;
  }

  async saveOrUpdateState (state: StateInterface): Promise<StateInterface> {
    return {} as StateInterface;
  }

  async removeStates (blockNumber: number, kind: StateKind): Promise<void> {
    return undefined;
  }

  getStateData (state: StateInterface): any {
    return undefined;
  }

  updateStateStatusMap (address: string, stateStatus: StateStatus): void {
    return undefined;
  }

  async resetWatcherToBlock (blockNumber: number): Promise<void> {
    return undefined;
  }

  async clearProcessedBlockData (block: BlockProgressInterface): Promise<void> {
    return undefined;
  }

  cacheContract (contract: ContractInterface): void {
    return undefined;
  }

  async processInitialState (contractAddress: string, blockHash: string): Promise<any> {
    return undefined;
  }

  async processStateCheckpoint (contractAddress: string, blockHash: string): Promise<boolean> {
    return false;
  }

  async getFullTransactions (txHashList: string[]): Promise<EthFullTransaction[]> {
    return [];
  }

  async switchClients (): Promise<void> {
    return undefined;
  }

  async isGetLogsRequestsSlow (): Promise<boolean> {
    return false;
  }
}
