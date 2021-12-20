import assert from 'assert';
import { FindConditions, FindManyOptions } from 'typeorm';

import {
  IndexerInterface,
  BlockProgressInterface,
  EventInterface,
  SyncStatusInterface
} from '@vulcanize/util';

export class Indexer implements IndexerInterface {
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

  async fetchBlockEvents (block: BlockProgressInterface): Promise<BlockProgressInterface> {
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
}

class SyncStatus implements SyncStatusInterface {
  id: number;
  chainHeadBlockHash: string;
  chainHeadBlockNumber: number;
  latestIndexedBlockHash: string;
  latestIndexedBlockNumber: number;
  latestCanonicalBlockHash: string;
  latestCanonicalBlockNumber: number;

  constructor () {
    this.id = 0;
    this.chainHeadBlockHash = '0';
    this.chainHeadBlockNumber = 0;
    this.latestIndexedBlockHash = '0';
    this.latestIndexedBlockNumber = 0;
    this.latestCanonicalBlockHash = '0';
    this.latestCanonicalBlockNumber = 0;
  }
}
