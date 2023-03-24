/* eslint-disable @typescript-eslint/no-unused-vars */

import assert from 'assert';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';

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
  StateKind
} from '@cerc-io/util';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { GetStorageAt, getStorageValue, MappingKey, StorageLayout } from '@cerc-io/solidity-mapper';

export class Indexer implements IndexerInterface {
  _getStorageAt: GetStorageAt;
  _storageLayoutMap: Map<string, StorageLayout> = new Map();

  constructor (ethClient: EthClient, storageLayoutMap?: Map<string, StorageLayout>) {
    this._getStorageAt = ethClient.getStorageAt.bind(ethClient);

    if (storageLayoutMap) {
      this._storageLayoutMap = storageLayoutMap;
    }
  }

  get serverConfig () {
    return {} as ServerConfig;
  }

  get storageLayoutMap (): Map<string, StorageLayout> {
    return this._storageLayoutMap;
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

  async getSyncStatus (): Promise<SyncStatusInterface | undefined> {
    return undefined;
  }

  async getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any> {
    assert(blockFilter);

    return undefined;
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

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    assert(blockHash);
    assert(depth);

    return '';
  }

  async saveBlockAndFetchEvents (block: BlockProgressInterface): Promise<[BlockProgressInterface, DeepPartial<EventInterface>[]]> {
    return [block, []];
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

  async processEvent (event: EventInterface): Promise<void> {
    assert(event);
  }

  async getStateSyncStatus (): Promise<StateSyncStatusInterface | undefined> {
    return undefined;
  }

  async updateStateSyncStatusIndexedBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface> {
    return {} as StateSyncStatusInterface;
  }

  async updateStateSyncStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface> {
    return {} as StateSyncStatusInterface;
  }

  async getLatestCanonicalBlock (): Promise<BlockProgressInterface> {
    return {} as BlockProgressInterface;
  }

  isWatchedContract (address : string): ContractInterface | undefined {
    return undefined;
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
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

  cacheContract (contract: ContractInterface): void {
    return undefined;
  }

  async processInitialState (contractAddress: string, blockHash: string): Promise<any> {
    return undefined;
  }

  async processStateCheckpoint (contractAddress: string, blockHash: string): Promise<boolean> {
    return false;
  }
}
