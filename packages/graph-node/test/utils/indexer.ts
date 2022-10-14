import assert from 'assert';
import { FindConditions, FindManyOptions } from 'typeorm';

import {
  IndexerInterface,
  BlockProgressInterface,
  EventInterface,
  SyncStatusInterface,
  ServerConfig as ServerConfigInterface,
  ValueResult,
  ContractInterface,
  IpldStatus as IpldStatusInterface,
  IPLDBlockInterface
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

  async fetchBlockWithEvents (block: BlockProgressInterface): Promise<BlockProgressInterface> {
    return block;
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

    return new SyncStatus();
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface> {
    assert(blockNumber);
    assert(blockHash);
    assert(force);

    return new SyncStatus();
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface> {
    assert(blockNumber);
    assert(blockHash);
    assert(force);

    return new SyncStatus();
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

  isWatchedContract (address : string): ContractInterface | undefined {
    return undefined;
  }

  async processBlock (blockProgress: BlockProgressInterface): Promise<void> {
    return undefined;
  }

  getIPLDData (ipldBlock: IPLDBlockInterface): any {
    return undefined;
  }

  async updateIPLDStatusMap (address: string, ipldStatus: IpldStatusInterface): Promise<void> {
    return undefined;
  }
}

class SyncStatus implements SyncStatusInterface {
  id: number;
  chainHeadBlockHash: string;
  chainHeadBlockNumber: number;
  latestIndexedBlockHash: string;
  latestIndexedBlockNumber: number;
  latestCanonicalBlockHash: string;
  latestCanonicalBlockNumber: number;
  initialIndexedBlockHash: string;
  initialIndexedBlockNumber: number;

  constructor () {
    this.id = 0;
    this.chainHeadBlockHash = '0';
    this.chainHeadBlockNumber = 0;
    this.latestIndexedBlockHash = '0';
    this.latestIndexedBlockNumber = 0;
    this.latestCanonicalBlockHash = '0';
    this.latestCanonicalBlockNumber = 0;
    this.initialIndexedBlockHash = '0';
    this.initialIndexedBlockNumber = 0;
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
  }
}
