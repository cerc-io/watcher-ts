//
// Copyright 2021 Vulcanize, Inc.
//

import { DeepPartial, FindConditions, FindManyOptions, QueryRunner } from 'typeorm';

export interface BlockProgressInterface {
  id: number;
  cid: string;
  blockHash: string;
  parentHash: string;
  blockNumber: number;
  blockTimestamp: number;
  numEvents: number;
  numProcessedEvents: number;
  lastProcessedEventIndex: number;
  isComplete: boolean;
  isPruned: boolean;
}

export interface SyncStatusInterface {
  id: number;
  chainHeadBlockHash: string;
  chainHeadBlockNumber: number;
  latestIndexedBlockHash: string;
  latestIndexedBlockNumber: number;
  latestCanonicalBlockHash: string;
  latestCanonicalBlockNumber: number;
}

export interface EventInterface {
  id: number;
  block: BlockProgressInterface;
  txHash: string;
  index: number;
  contract: string;
  eventName: string;
  eventInfo: string;
  extraInfo: string;
  proof: string;
}

export interface ContractInterface {
  id: number;
  address: string;
  startingBlock: number;
  kind: string;
  checkpoint: boolean;
}

export interface IndexerInterface {
  getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined>
  getEvent (id: string): Promise<EventInterface | undefined>
  getSyncStatus (): Promise<SyncStatusInterface | undefined>;
  getBlock (blockHash: string): Promise<any>
  getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]>;
  getBlockEvents (blockHash: string): Promise<Array<EventInterface>>
  getAncestorAtDepth (blockHash: string, depth: number): Promise<string>
  getOrFetchBlockEvents (block: DeepPartial<BlockProgressInterface>): Promise<Array<EventInterface>>
  removeUnknownEvents (block: BlockProgressInterface): Promise<void>
  updateBlockProgress (blockHash: string, lastProcessedEventIndex: number): Promise<void>
  updateSyncStatusChainHead (blockHash: string, blockNumber: number): Promise<SyncStatusInterface>
  updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  markBlocksAsPruned (blocks: BlockProgressInterface[]): Promise<void>;
  processBlock(blockHash: string): Promise<void>;
}

export interface EventWatcherInterface {
  getBlockProgressEventIterator (): AsyncIterator<any>
  initBlockProcessingOnCompleteHandler (): Promise<void>
  initEventProcessingOnCompleteHandler (): Promise<void>
}

export interface DatabaseInterface {
  createTransactionRunner(): Promise<QueryRunner>;
  getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]>;
  getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined>;
  getBlockEvents (blockHash: string, where?: FindConditions<EventInterface>): Promise<EventInterface[]>;
  getEvent (id: string): Promise<EventInterface | undefined>
  getSyncStatus (queryRunner: QueryRunner): Promise<SyncStatusInterface | undefined>
  getAncestorAtDepth (blockHash: string, depth: number): Promise<string>
  getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }>;
  getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<EventInterface>>;
  markBlocksAsPruned (queryRunner: QueryRunner, blocks: BlockProgressInterface[]): Promise<void>;
  updateBlockProgress (queryRunner: QueryRunner, blockHash: string, lastProcessedEventIndex: number): Promise<void>
  updateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>;
  updateSyncStatusChainHead (queryRunner: QueryRunner, blockHash: string, blockNumber: number): Promise<SyncStatusInterface>;
  updateSyncStatusCanonicalBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>;
  saveEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgressInterface>, events: DeepPartial<EventInterface>[]): Promise<void>;
  saveEventEntity (queryRunner: QueryRunner, entity: EventInterface): Promise<EventInterface>;
  removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindManyOptions<Entity> | FindConditions<Entity>): Promise<void>;
  getContract?: (address: string) => Promise<ContractInterface | undefined>
}
