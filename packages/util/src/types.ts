//
// Copyright 2021 Vulcanize, Inc.
//

import { Connection, DeepPartial, FindConditions, FindManyOptions, QueryRunner } from 'typeorm';

import { Where, QueryOptions } from './database';

export interface BlockProgressInterface {
  id: number;
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
}

export interface IndexerInterface {
  getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined>
  getBlockProgressEntities (where: FindConditions<BlockProgressInterface>, options: FindManyOptions<BlockProgressInterface>): Promise<BlockProgressInterface[]>
  getEvent (id: string): Promise<EventInterface | undefined>
  getSyncStatus (): Promise<SyncStatusInterface | undefined>;
  getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any>
  getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]>;
  getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<EventInterface>>
  getAncestorAtDepth (blockHash: string, depth: number): Promise<string>
  fetchBlockEvents (block: DeepPartial<BlockProgressInterface>): Promise<BlockProgressInterface>
  removeUnknownEvents (block: BlockProgressInterface): Promise<void>
  updateBlockProgress (block: BlockProgressInterface, lastProcessedEventIndex: number): Promise<BlockProgressInterface>
  updateSyncStatusChainHead (blockHash: string, blockNumber: number): Promise<SyncStatusInterface>
  updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  markBlocksAsPruned (blocks: BlockProgressInterface[]): Promise<void>;
  saveEventEntity (dbEvent: EventInterface): Promise<EventInterface>;
  processEvent (event: EventInterface): Promise<void>;
  parseEventNameAndArgs?: (kind: string, logObj: any) => any;
  isWatchedContract?: (address: string) => Promise<ContractInterface | undefined>;
  cacheContract?: (contract: ContractInterface) => void;
}

export interface EventWatcherInterface {
  getBlockProgressEventIterator (): AsyncIterator<any>
  initBlockProcessingOnCompleteHandler (): Promise<void>
  initEventProcessingOnCompleteHandler (): Promise<void>
}

export interface DatabaseInterface {
  _conn: Connection;
  createTransactionRunner(): Promise<QueryRunner>;
  getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]>;
  getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined>;
  getBlockProgressEntities (where: FindConditions<BlockProgressInterface>, options: FindManyOptions<BlockProgressInterface>): Promise<BlockProgressInterface[]>
  getBlockEvents (blockHash: string, where?: Where, queryOptions?: QueryOptions): Promise<EventInterface[]>;
  getEvent (id: string): Promise<EventInterface | undefined>
  getSyncStatus (queryRunner: QueryRunner): Promise<SyncStatusInterface | undefined>
  getAncestorAtDepth (blockHash: string, depth: number): Promise<string>
  getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }>;
  getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<EventInterface>>;
  markBlocksAsPruned (queryRunner: QueryRunner, blocks: BlockProgressInterface[]): Promise<void>;
  updateBlockProgress (queryRunner: QueryRunner, block: BlockProgressInterface, lastProcessedEventIndex: number): Promise<BlockProgressInterface>
  updateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>;
  updateSyncStatusChainHead (queryRunner: QueryRunner, blockHash: string, blockNumber: number): Promise<SyncStatusInterface>;
  updateSyncStatusCanonicalBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>;
  saveEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgressInterface>, events: DeepPartial<EventInterface>[]): Promise<BlockProgressInterface>;
  saveEventEntity (queryRunner: QueryRunner, entity: EventInterface): Promise<EventInterface>;
  removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindManyOptions<Entity> | FindConditions<Entity>): Promise<void>;
  getContracts?: () => Promise<ContractInterface[]>
  saveContract?: (queryRunner: QueryRunner, contractAddress: string, kind: string, startingBlock: number) => Promise<ContractInterface>
}
