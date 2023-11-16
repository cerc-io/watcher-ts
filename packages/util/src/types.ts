//
// Copyright 2021 Vulcanize, Inc.
//

import { Connection, DeepPartial, EntityTarget, FindConditions, FindManyOptions, ObjectLiteral, QueryRunner } from 'typeorm';
import { Transaction } from 'ethers';

import { MappingKey, StorageLayout } from '@cerc-io/solidity-mapper';

import { ServerConfig, UpstreamConfig } from './config';
import { Where, QueryOptions, Database } from './database';
import { ValueResult, StateStatus, ExtraEventData } from './indexer';
import { JOB_KIND_CONTRACT, JOB_KIND_EVENTS } from './constants';

export enum StateKind {
  Diff = 'diff',
  Init = 'init',
  DiffStaged = 'diff_staged',
  Checkpoint = 'checkpoint'
}

export interface BlockProgressInterface {
  id: number;
  cid: string | null;
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
  latestProcessedBlockHash: string;
  latestProcessedBlockNumber: number;
  latestCanonicalBlockHash: string;
  latestCanonicalBlockNumber: number;
  initialIndexedBlockHash: string;
  initialIndexedBlockNumber: number;
  hasIndexingError: boolean;
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
  context: Record<string, { data: any, type: string }>;
}

export interface StateInterface {
  id: number;
  block: BlockProgressInterface;
  contractAddress: string;
  cid: string;
  kind: StateKind;
  data: Buffer;
}

export interface EthFullTransaction {
  ethTransactionCidByTxHash: {
    txHash: string;
    index: number;
    src: string;
    dst?: string;
    blockByMhKey?: {
      data: string;
    }
  },
  data?: Transaction;
}

export interface EthFullBlock {
  id?: string,
  cid?: string;
  blockNumber: string;
  blockHash: string;
  parentHash: string;
  timestamp: string;
  stateRoot: string;
  td: string;
  txRoot: string;
  receiptRoot: string;
  uncleRoot: string;
  bloom: string;
  size: string;
  blockByMhKey: {
    data: string;
  }
}

export interface EthClient {
  getStorageAt({ blockHash, contract, slot }: {
    blockHash: string;
    contract: string;
    slot: string;
  }): Promise<{
    value: string;
    proof: {
        data: string;
    };
  }>;
  getBlockWithTransactions({ blockNumber, blockHash }: {
    blockNumber?: number;
    blockHash?: string;
  }): Promise<any>;
  getBlocks({ blockNumber, blockHash }: {
    blockNumber?: number;
    blockHash?: string;
  }): Promise<any>;
  getFullBlocks({ blockNumber, blockHash }: {
    blockNumber?: number;
    blockHash?: string;
  }): Promise<EthFullBlock[]>;
  getFullTransaction(txHash: string, blockNumber?: number): Promise<EthFullTransaction>;
  getBlockByHash(blockHash?: string): Promise<any>;
  getLogs(vars: {
    blockHash: string,
    blockNumber: string,
    addresses?: string[],
    topics?: string[][]
  }): Promise<any>;
  getLogsForBlockRange?: (vars: {
    fromBlock?: number,
    toBlock?: number,
    addresses?: string[],
    topics?: string[][]
  }) => Promise<any>;
}

export interface IndexerInterface {
  eventSignaturesMap: Map<string, string[]>
  readonly serverConfig: ServerConfig
  readonly upstreamConfig: UpstreamConfig
  readonly storageLayoutMap: Map<string, StorageLayout>
  init (): Promise<void>
  getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined>
  getBlockProgressEntities (where: FindConditions<BlockProgressInterface>, options: FindManyOptions<BlockProgressInterface>): Promise<BlockProgressInterface[]>
  getEntitiesForBlock (blockHash: string, tableName: string): Promise<any[]>
  getEvent (id: string): Promise<EventInterface | undefined>
  getSyncStatus (): Promise<SyncStatusInterface | undefined>
  getStateSyncStatus (): Promise<StateSyncStatusInterface | undefined>
  getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<EthFullBlock[]>
  getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]>
  getLatestCanonicalBlock (): Promise<BlockProgressInterface | undefined>
  getLatestStateIndexedBlock (): Promise<BlockProgressInterface>
  getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<EventInterface>>
  getAncestorAtDepth (blockHash: string, depth: number): Promise<string>
  fetchEventsAndSaveBlocks (blocks: DeepPartial<BlockProgressInterface>[]): Promise<{ blockProgress: BlockProgressInterface, events: DeepPartial<EventInterface>[] }[]>
  saveBlockAndFetchEvents (block: DeepPartial<BlockProgressInterface>): Promise<[
    BlockProgressInterface,
    DeepPartial<EventInterface>[],
    EthFullTransaction[]
  ]>
  fetchAndSaveFilteredEventsAndBlocks (startBlock: number, endBlock: number): Promise<{
    blockProgress: BlockProgressInterface,
    events: DeepPartial<EventInterface>[],
    ethFullBlock: EthFullBlock,
    ethFullTransactions: EthFullTransaction[]
  }[]>
  fetchEventsForContracts (blockHash: string, blockNumber: number, addresses: string[]): Promise<DeepPartial<EventInterface>[]>
  removeUnknownEvents (block: BlockProgressInterface): Promise<void>
  updateBlockProgress (block: BlockProgressInterface, lastProcessedEventIndex: number): Promise<BlockProgressInterface>
  updateSyncStatusChainHead (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  updateSyncStatusIndexingError (hasIndexingError: boolean): Promise<SyncStatusInterface | undefined>
  updateSyncStatusProcessedBlock (blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>
  updateStateSyncStatusIndexedBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface | undefined>
  updateStateSyncStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface>
  markBlocksAsPruned (blocks: BlockProgressInterface[]): Promise<void>
  saveEventEntity (dbEvent: EventInterface): Promise<EventInterface>
  saveEvents (dbEvents: DeepPartial<EventInterface>[]): Promise<void>
  processEvent (event: EventInterface, extraData: ExtraEventData): Promise<void>
  parseEventNameAndArgs?: (kind: string, logObj: any) => any
  isWatchedContract: (address: string) => ContractInterface | undefined;
  getWatchedContracts: () => ContractInterface[]
  getContractsByKind?: (kind: string) => ContractInterface[]
  addContracts?: () => Promise<void>
  cacheContract: (contract: ContractInterface) => void;
  watchContract: (address: string, kind: string, checkpoint: boolean, startingBlock: number, context?: any) => Promise<void>
  getEntityTypesMap?: () => Map<string, { [key: string]: string }>
  getRelationsMap?: () => Map<any, { [key: string]: any }>
  processInitialState: (contractAddress: string, blockHash: string) => Promise<any>
  processStateCheckpoint: (contractAddress: string, blockHash: string) => Promise<boolean>
  processBlock: (blockProgres: BlockProgressInterface) => Promise<void>
  processBlockAfterEvents?: (blockHash: string, blockNumber: number) => Promise<void>
  processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void>
  processCheckpoint (blockHash: string): Promise<void>
  processCLICheckpoint (contractAddress: string, blockHash?: string): Promise<string | undefined>
  createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void>
  createDiff (contractAddress: string, blockHash: string, data: any): Promise<void>
  createCheckpoint (contractAddress: string, blockHash: string): Promise<string | undefined>
  createInit? (blockHash: string, blockNumber: number): Promise<void>
  getStorageValue (storageLayout: StorageLayout, blockHash: string, contractAddress: string, variable: string, ...mappingKeys: MappingKey[]): Promise<ValueResult>
  updateSubgraphState?: (contractAddress: string, data: any) => void
  dumpSubgraphState?: (blockHash: string, isStateFinalized?: boolean) => Promise<void>
  updateStateStatusMap (address: string, stateStatus: StateStatus): void
  getStateData (state: StateInterface): any
  getStateByCID (cid: string): Promise<StateInterface | undefined>
  getStates (where: FindConditions<StateInterface>): Promise<StateInterface[]>
  getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<StateInterface | undefined>
  saveOrUpdateState (state: StateInterface): Promise<StateInterface>
  removeStates (blockNumber: number, kind: StateKind): Promise<void>
  resetWatcherToBlock (blockNumber: number): Promise<void>
  clearProcessedBlockData (block: BlockProgressInterface): Promise<void>
  getResultEvent (event: EventInterface): any
}

export interface DatabaseInterface {
  _conn: Connection;
  readonly baseDatabase: Database
  readonly graphDatabase?: any
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
  updateSyncStatusIndexingError (queryRunner: QueryRunner, hasIndexingError: boolean): Promise<SyncStatusInterface | undefined>;
  updateSyncStatusProcessedBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force?: boolean): Promise<SyncStatusInterface>;
  saveEvents (queryRunner: QueryRunner, events: DeepPartial<EventInterface>[]): Promise<void>;
  saveBlockWithEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgressInterface>, events: DeepPartial<EventInterface>[]): Promise<BlockProgressInterface>;
  saveEventEntity (queryRunner: QueryRunner, entity: EventInterface): Promise<EventInterface>;
  removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindManyOptions<Entity> | FindConditions<Entity>): Promise<void>;
  deleteEntitiesByConditions<Entity> (queryRunner: QueryRunner, entity: EntityTarget<Entity>, findConditions: FindConditions<Entity>): Promise<void>
  getContracts: () => Promise<ContractInterface[]>
  saveContract: (queryRunner: QueryRunner, contractAddress: string, kind: string, checkpoint: boolean, startingBlock: number, context?: any) => Promise<ContractInterface>
  getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<StateInterface | undefined>
  getStates (where: FindConditions<StateInterface>): Promise<StateInterface[]>
  getDiffStatesInRange (contractAddress: string, startBlock: number, endBlock: number): Promise<StateInterface[]>
  getNewState (): StateInterface
  removeStates(queryRunner: QueryRunner, blockNumber: number, kind: StateKind): Promise<void>
  removeStatesAfterBlock: (queryRunner: QueryRunner, blockNumber: number) => Promise<void>
  saveOrUpdateState (queryRunner: QueryRunner, state: StateInterface): Promise<StateInterface>
  getStateSyncStatus (): Promise<StateSyncStatusInterface | undefined>
  updateStateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface>
  updateStateSyncStatusCheckpointBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface>
}

export interface GraphDatabaseInterface {
  getEntity<Entity extends ObjectLiteral> (entity: (new () => Entity) | string, id: string, blockHash?: string): Promise<Entity | undefined>;
}

export interface GraphWatcherInterface {
  init (): Promise<void>;
  setIndexer (indexer: IndexerInterface): void;
}

export type Clients = {
  ethClient: EthClient;
  [key: string]: any;
}

export enum EventsQueueJobKind {
  EVENTS = JOB_KIND_EVENTS,
  CONTRACT = JOB_KIND_CONTRACT
}

export interface EventsJobData {
  kind: EventsQueueJobKind.EVENTS;
  blockHash: string;
  publish: boolean;
}

export interface ContractJobData {
  kind: EventsQueueJobKind.CONTRACT;
  contract: ContractInterface;
}
