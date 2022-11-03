import assert from 'assert';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';

import {
  IndexerInterface,
  BlockProgressInterface,
  EventInterface,
  SyncStatusInterface,
  ServerConfig as ServerConfigInterface,
  ValueResult,
  ContractInterface,
  StateStatus,
  StateSyncStatusInterface,
  StateInterface
} from '@cerc-io/util';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { GetStorageAt, getStorageValue, MappingKey, StorageLayout } from '@cerc-io/solidity-mapper';

export class Indexer implements IndexerInterface {
  _getStorageAt: GetStorageAt;
  _storageLayoutMap: Map<string, StorageLayout> = new Map()

  constructor (ethClient: EthClient, storageLayoutMap?: Map<string, StorageLayout>) {
    this._getStorageAt = ethClient.getStorageAt.bind(ethClient);

    if (storageLayoutMap) {
      this._storageLayoutMap = storageLayoutMap;
    }
  }

  get serverConfig () {
    return new ServerConfig();
  }

  get storageLayoutMap (): Map<string, StorageLayout> {
    return this._storageLayoutMap;
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

  async processBlock (blockProgress: BlockProgressInterface): Promise<void> {
    return undefined;
  }

  async processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void> {
    return undefined;
  }

  async processCheckpoint (blockHash: string): Promise<void> {
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
}

class ServerConfig implements ServerConfigInterface {
  host: string;
  port: number;
  mode: string;
  kind: string;
  checkpointing: boolean;
  checkpointInterval: number;
  subgraphPath: string;
  disableSubgraphState: boolean;
  wasmRestartBlocksInterval: number;
  filterLogs: boolean;
  maxEventsBlockRange: number;
  clearEntitiesCacheInterval: number;
  skipStateFieldsUpdate: boolean;

  constructor () {
    this.host = '';
    this.port = 0;
    this.mode = '';
    this.kind = '';
    this.checkpointing = false;
    this.checkpointInterval = 0;
    this.subgraphPath = '';
    this.disableSubgraphState = false;
    this.wasmRestartBlocksInterval = 0;
    this.filterLogs = false;
    this.maxEventsBlockRange = 0;
    this.clearEntitiesCacheInterval = 0;
    this.skipStateFieldsUpdate = false;
  }
}
