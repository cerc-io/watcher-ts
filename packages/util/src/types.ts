//
// Copyright 2021 Vulcanize, Inc.
//

import { Connection, DeepPartial, EntityTarget, FindConditions, FindManyOptions, QueryRunner } from 'typeorm';

import { MappingKey, StorageLayout } from '@cerc-io/solidity-mapper';
import { EthClient } from '@cerc-io/ipld-eth-client';

import { ServerConfig } from './config';
import { Where, QueryOptions, Database } from './database';
import { ValueResult, StateStatus } from './indexer';

export enum StateKind {
  Diff = 'diff',
  Init = 'init',
  DiffStaged = 'diff_staged',
  Checkpoint = 'checkpoint'
}

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
  createdAt: Date;
}

export interface SyncStatusInterface {
  id: number;
  chainHeadBlockHash: string;
  chainHeadBlockNumber: number;
  latestIndexedBlockHash: string;
  latestIndexedBlockNumber: number;
  latestCanonicalBlockHash: string;
  latestCanonicalBlockNumber: number;
  initialIndexedBlockHash: string;
  initialIndexedBlockNumber: number;
}

export interface StateSyncStatusInterface {
  id: number;
  latestIndexedBlockNumber: number;
  latestCheckpointBlockNumber: number;
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

export interface StateInterface {
  id: number;
  block: BlockProgressInterface;
  contractAddress: string;
  cid: string;
  kind: StateKind;
  data: Buffer;
}

export interface IndexerInterface {
  readonly serverConfig: ServerConfig
  readonly storageLayoutMap: Map<string, StorageLayout>
  init (): Promise<void>
  getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined>
  getBlockProgressEntities (where: FindConditions<BlockProgressInterface>, options: FindManyOptions<BlockProgressInterface>): Promise<BlockProgressInterface[]>
  getEvent (id: string): Promise<EventInterface | undefined>
  getSyncStatus (): Promise<SyncStatusInterface | undefined>
  getStateSyncStatus (): Promise<StateSyncStatusInterface | undefined>
  getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any>
  getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]>
  getLatestCanonicalBlock (): Promise<BlockProgressInterface>
  getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<EventInterface>>
  getAncestorAtDepth (blockHash: string, depth: number): Promise<string>
  saveBlockAndFetchEvents (block: DeepPartial<BlockProgressInterface>): Promise<[BlockProgressInterface, DeepPartial<EventInterface>[]]>
  removeUnknownEvents (block: BlockProgressInterface): Promise<void>
  updateBlockProgress (block: BlockProgressInterface, lastProcessedEventIndex: number): Promise<BlockProgressInterface>
  updateSyncStatusChainHead (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  updateStateSyncStatusIndexedBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface>
  updateStateSyncStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface>
  markBlocksAsPruned (blocks: BlockProgressInterface[]): Promise<void>
  saveEventEntity (dbEvent: EventInterface): Promise<EventInterface>
  processEvent (event: EventInterface): Promise<void>
  parseEventNameAndArgs?: (kind: string, logObj: any) => any
  isWatchedContract: (address: string) => ContractInterface | undefined;
  getContractsByKind?: (kind: string) => ContractInterface[]
  cacheContract?: (contract: ContractInterface) => void;
  watchContract?: (address: string, kind: string, checkpoint: boolean, startingBlock: number) => Promise<void>
  getEntityTypesMap?: () => Map<string, { [key: string]: string }>
  getRelationsMap?: () => Map<any, { [key: string]: any }>
  createDiffStaged?: (contractAddress: string, blockHash: string, data: any) => Promise<void>
  processInitialState?: (contractAddress: string, blockHash: string) => Promise<any>
  processStateCheckpoint?: (contractAddress: string, blockHash: string) => Promise<boolean>
  processBlock: (blockProgres: BlockProgressInterface) => Promise<void>
  processBlockAfterEvents?: (blockHash: string, blockNumber: number) => Promise<void>
  processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void>
  processCheckpoint (blockHash: string): Promise<void>
  processCLICheckpoint (contractAddress: string, blockHash?: string): Promise<string | undefined>
  getStorageValue (storageLayout: StorageLayout, blockHash: string, contractAddress: string, variable: string, ...mappingKeys: MappingKey[]): Promise<ValueResult>
  updateSubgraphState?: (contractAddress: string, data: any) => void
  updateStateStatusMap (address: string, stateStatus: StateStatus): void
  getStateData (state: StateInterface): any
  resetWatcherToBlock (blockNumber: number): Promise<void>
  getResultEvent (event: EventInterface): any
}

export interface EventWatcherInterface {
  getBlockProgressEventIterator (): AsyncIterator<any>
  initBlockProcessingOnCompleteHandler (): Promise<void>
  initEventProcessingOnCompleteHandler (): Promise<void>
}

export interface DatabaseInterface {
  _conn: Connection;
  readonly baseDatabase: Database
  init (): Promise<void>;
  close (): Promise<void>;
  createTransactionRunner (): Promise<QueryRunner>;
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
  saveBlockProgress (queryRunner: QueryRunner, block: DeepPartial<BlockProgressInterface>): Promise<BlockProgressInterface>;
  updateBlockProgress (queryRunner: QueryRunner, block: BlockProgressInterface, lastProcessedEventIndex: number): Promise<BlockProgressInterface>
  updateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>;
  updateSyncStatusChainHead (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>;
  updateSyncStatusCanonicalBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>;
  saveEvents (queryRunner: QueryRunner, events: DeepPartial<EventInterface>[]): Promise<void>;
  saveBlockWithEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgressInterface>, events: DeepPartial<EventInterface>[]): Promise<BlockProgressInterface>;
  saveEventEntity (queryRunner: QueryRunner, entity: EventInterface): Promise<EventInterface>;
  removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindManyOptions<Entity> | FindConditions<Entity>): Promise<void>;
  deleteEntitiesByConditions<Entity> (queryRunner: QueryRunner, entity: EntityTarget<Entity>, findConditions: FindConditions<Entity>): Promise<void>
  getContracts?: () => Promise<ContractInterface[]>
  saveContract?: (queryRunner: QueryRunner, contractAddress: string, kind: string, checkpoint: boolean, startingBlock: number) => Promise<ContractInterface>
  getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<StateInterface | undefined>
  getStates (where: FindConditions<StateInterface>): Promise<StateInterface[]>
  getDiffStatesInRange (contractAddress: string, startBlock: number, endBlock: number): Promise<StateInterface[]>
  getNewState (): StateInterface
  removeStates(queryRunner: QueryRunner, blockNumber: number, kind: StateKind): Promise<void>
  removeStatesAfterBlock?: (queryRunner: QueryRunner, blockNumber: number) => Promise<void>
  saveOrUpdateState (queryRunner: QueryRunner, state: StateInterface): Promise<StateInterface>
  getStateSyncStatus (): Promise<StateSyncStatusInterface | undefined>
  updateStateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface>
  updateStateSyncStatusCheckpointBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface>
}

export interface GraphDatabaseInterface {
  getEntity<Entity> (entity: (new () => Entity) | string, id: string, blockHash?: string): Promise<Entity | undefined>;
}

export type Clients = {
  ethClient: EthClient;
  [key: string]: any;
}
