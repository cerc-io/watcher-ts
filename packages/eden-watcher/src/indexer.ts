//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { DeepPartial, FindConditions, FindManyOptions, ObjectLiteral } from 'typeorm';
import { ethers } from 'ethers';
import { SelectionNode } from 'graphql';

import { JsonFragment } from '@ethersproject/abi';
import { BaseProvider } from '@ethersproject/providers';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { MappingKey, StorageLayout } from '@cerc-io/solidity-mapper';
import {
  Indexer as BaseIndexer,
  ServerConfig,
  JobQueue,
  Where,
  QueryOptions,
  BlockHeight,
  StateKind,
  IndexerInterface,
  StateStatus,
  ValueResult,
  ResultEvent,
  getResultEvent,
  DatabaseInterface,
  Clients,
  GraphWatcherInterface,
  updateSubgraphState,
  dumpSubgraphState
} from '@cerc-io/util';
import { GraphWatcher } from '@cerc-io/graph-node';

import { Database, ENTITIES, SUBGRAPH_ENTITIES } from './database';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { StateSyncStatus } from './entity/StateSyncStatus';
import { BlockProgress } from './entity/BlockProgress';
import { State } from './entity/State';
import EdenNetworkArtifacts from './artifacts/EdenNetwork.json';
import MerkleDistributorArtifacts from './artifacts/MerkleDistributor.json';
import DistributorGovernanceArtifacts from './artifacts/DistributorGovernance.json';
import { createInitialState, handleEvent, createStateDiff, createStateCheckpoint } from './hooks';
import { ProducerSet } from './entity/ProducerSet';
import { Producer } from './entity/Producer';
import { RewardSchedule } from './entity/RewardSchedule';
import { RewardScheduleEntry } from './entity/RewardScheduleEntry';
import { Network } from './entity/Network';
import { Staker } from './entity/Staker';
import { ProducerEpoch } from './entity/ProducerEpoch';
import { Epoch } from './entity/Epoch';
import { Block } from './entity/Block';
import { SlotClaim } from './entity/SlotClaim';
import { Slot } from './entity/Slot';
import { Distributor } from './entity/Distributor';
import { Distribution } from './entity/Distribution';
import { Claim } from './entity/Claim';
import { Account } from './entity/Account';
import { Slash } from './entity/Slash';
import { FrothyEntity } from './entity/FrothyEntity';

const KIND_EDENNETWORK = 'EdenNetwork';
const KIND_MERKLEDISTRIBUTOR = 'EdenNetworkDistribution';
const KIND_DISTRIBUTORGOVERNANCE = 'EdenNetworkGovernance';

export class Indexer implements IndexerInterface {
  _db: Database;
  _ethClient: EthClient;
  _ethProvider: BaseProvider;
  _baseIndexer: BaseIndexer;
  _serverConfig: ServerConfig;
  _graphWatcher: GraphWatcher;

  _abiMap: Map<string, JsonFragment[]>;
  _storageLayoutMap: Map<string, StorageLayout>;
  _contractMap: Map<string, ethers.utils.Interface>;

  _entityTypesMap: Map<string, { [key: string]: string }>;
  _relationsMap: Map<any, { [key: string]: any }>;

  _subgraphStateMap: Map<string, any>;

  constructor (serverConfig: ServerConfig, db: DatabaseInterface, clients: Clients, ethProvider: BaseProvider, jobQueue: JobQueue, graphWatcher?: GraphWatcherInterface) {
    assert(db);
    assert(clients.ethClient);

    this._db = db as Database;
    this._ethClient = clients.ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._baseIndexer = new BaseIndexer(this._serverConfig, this._db, this._ethClient, this._ethProvider, jobQueue);

    assert(graphWatcher);
    this._graphWatcher = graphWatcher as GraphWatcher;

    this._abiMap = new Map();
    this._storageLayoutMap = new Map();
    this._contractMap = new Map();

    const { abi: EdenNetworkABI, storageLayout: EdenNetworkStorageLayout } = EdenNetworkArtifacts;
    const { abi: MerkleDistributorABI, storageLayout: MerkleDistributorStorageLayout } = MerkleDistributorArtifacts;
    const { abi: DistributorGovernanceABI, storageLayout: DistributorGovernanceStorageLayout } = DistributorGovernanceArtifacts;

    assert(EdenNetworkABI);
    assert(EdenNetworkStorageLayout);

    assert(MerkleDistributorABI);
    assert(MerkleDistributorStorageLayout);

    assert(DistributorGovernanceABI);
    assert(DistributorGovernanceStorageLayout);

    this._abiMap.set(KIND_EDENNETWORK, EdenNetworkABI);
    this._storageLayoutMap.set(KIND_EDENNETWORK, EdenNetworkStorageLayout);
    this._contractMap.set(KIND_EDENNETWORK, new ethers.utils.Interface(EdenNetworkABI));

    this._abiMap.set(KIND_MERKLEDISTRIBUTOR, MerkleDistributorABI);
    this._storageLayoutMap.set(KIND_MERKLEDISTRIBUTOR, MerkleDistributorStorageLayout);
    this._contractMap.set(KIND_MERKLEDISTRIBUTOR, new ethers.utils.Interface(MerkleDistributorABI));

    this._abiMap.set(KIND_DISTRIBUTORGOVERNANCE, DistributorGovernanceABI);
    this._storageLayoutMap.set(KIND_DISTRIBUTORGOVERNANCE, DistributorGovernanceStorageLayout);
    this._contractMap.set(KIND_DISTRIBUTORGOVERNANCE, new ethers.utils.Interface(DistributorGovernanceABI));

    this._entityTypesMap = new Map();
    this._populateEntityTypesMap();

    this._relationsMap = new Map();
    this._populateRelationsMap();

    this._subgraphStateMap = new Map();
  }

  get serverConfig (): ServerConfig {
    return this._serverConfig;
  }

  get storageLayoutMap (): Map<string, StorageLayout> {
    return this._storageLayoutMap;
  }

  get graphWatcher (): GraphWatcher {
    return this._graphWatcher;
  }

  async init (): Promise<void> {
    await this._baseIndexer.fetchContracts();
    await this._baseIndexer.fetchStateStatus();
  }

  getResultEvent (event: Event): ResultEvent {
    return getResultEvent(event);
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

  async processInitialState (contractAddress: string, blockHash: string): Promise<any> {
    // Call initial state hook.
    return createInitialState(this, contractAddress, blockHash);
  }

  async processStateCheckpoint (contractAddress: string, blockHash: string): Promise<boolean> {
    // Call checkpoint hook.
    return createStateCheckpoint(this, contractAddress, blockHash);
  }

  async processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void> {
    console.time('time:indexer#processCanonicalBlock-finalize_auto_diffs');
    // Finalize staged diff blocks if any.
    await this._baseIndexer.finalizeDiffStaged(blockHash);
    console.timeEnd('time:indexer#processCanonicalBlock-finalize_auto_diffs');

    // Call custom stateDiff hook.
    await createStateDiff(this, blockHash);

    this._graphWatcher.pruneEntityCacheFrothyBlocks(blockHash, blockNumber);
  }

  async processCheckpoint (blockHash: string): Promise<void> {
    // Return if checkpointInterval is <= 0.
    const checkpointInterval = this._serverConfig.checkpointInterval;
    if (checkpointInterval <= 0) return;

    console.time('time:indexer#processCheckpoint-checkpoint');

    await this._baseIndexer.processCheckpoint(this, blockHash, checkpointInterval);

    console.timeEnd('time:indexer#processCheckpoint-checkpoint');
  }

  async processCLICheckpoint (contractAddress: string, blockHash?: string): Promise<string | undefined> {
    return this._baseIndexer.processCLICheckpoint(this, contractAddress, blockHash);
  }

  async getPrevState (blockHash: string, contractAddress: string, kind?: string): Promise<State | undefined> {
    return this._db.getPrevState(blockHash, contractAddress, kind);
  }

  async getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<State | undefined> {
    return this._db.getLatestState(contractAddress, kind, blockNumber);
  }

  async getStatesByHash (blockHash: string): Promise<State[]> {
    return this._baseIndexer.getStatesByHash(blockHash);
  }

  async getStateByCID (cid: string): Promise<State | undefined> {
    return this._baseIndexer.getStateByCID(cid);
  }

  async getStates (where: FindConditions<State>): Promise<State[]> {
    return this._db.getStates(where);
  }

  async getDiffStatesInRange (contractAddress: string, startBlock: number, endBlock: number): Promise<State[]> {
    return this._db.getDiffStatesInRange(contractAddress, startBlock, endBlock);
  }

  getStateData (state: State): any {
    return this._baseIndexer.getStateData(state);
  }

  // Method used to create auto diffs (diff_staged).
  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    console.time('time:indexer#createDiffStaged-auto_diff');

    await this._baseIndexer.createDiffStaged(contractAddress, blockHash, data);

    console.timeEnd('time:indexer#createDiffStaged-auto_diff');
  }

  // Method to be used by createStateDiff hook.
  async createDiff (contractAddress: string, blockHash: string, data: any): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    await this._baseIndexer.createDiff(contractAddress, block, data);
  }

  // Method to be used by createStateCheckpoint hook.
  async createStateCheckpoint (contractAddress: string, blockHash: string, data: any): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._baseIndexer.createStateCheckpoint(contractAddress, block, data);
  }

  // Method to be used by export-state CLI.
  async createCheckpoint (contractAddress: string, blockHash: string): Promise<string | undefined> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._baseIndexer.createCheckpoint(this, contractAddress, block);
  }

  // Method to be used by fill-state CLI.
  async createInit (blockHash: string, blockNumber: number): Promise<void> {
    // Create initial state for contracts.
    await this._baseIndexer.createInit(this, blockHash, blockNumber);
  }

  async saveOrUpdateState (state: State): Promise<State> {
    return this._baseIndexer.saveOrUpdateState(state);
  }

  async removeStates (blockNumber: number, kind: StateKind): Promise<void> {
    await this._baseIndexer.removeStates(blockNumber, kind);
  }

  async getSubgraphEntity<Entity extends ObjectLiteral> (entity: new () => Entity, id: string, block: BlockHeight, selections: ReadonlyArray<SelectionNode> = []): Promise<any> {
    const data = await this._graphWatcher.getEntity(entity, id, this._relationsMap, block, selections);

    return data;
  }

  async getSubgraphEntities<Entity extends ObjectLiteral> (
    entity: new () => Entity,
    block: BlockHeight,
    where: { [key: string]: any } = {},
    queryOptions: QueryOptions = {},
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<any[]> {
    return this._graphWatcher.getEntities(entity, this._relationsMap, block, where, queryOptions, selections);
  }

  async triggerIndexingOnEvent (event: Event): Promise<void> {
    const resultEvent = this.getResultEvent(event);

    console.time('time:indexer#processEvent-mapping_code');

    // Call subgraph handler for event.
    await this._graphWatcher.handleEvent(resultEvent);

    console.timeEnd('time:indexer#processEvent-mapping_code');

    // Call custom hook function for indexing on event.
    await handleEvent(this, resultEvent);
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);
  }

  async processBlock (blockProgress: BlockProgress): Promise<void> {
    console.time('time:indexer#processBlock-init_state');
    // Call a function to create initial state for contracts.
    await this._baseIndexer.createInit(this, blockProgress.blockHash, blockProgress.blockNumber);
    console.timeEnd('time:indexer#processBlock-init_state');

    this._graphWatcher.updateEntityCacheFrothyBlocks(blockProgress);
  }

  async processBlockAfterEvents (blockHash: string, blockNumber: number): Promise<void> {
    console.time('time:indexer#processBlockAfterEvents-mapping_code');

    // Call subgraph handler for block.
    await this._graphWatcher.handleBlock(blockHash, blockNumber);

    console.timeEnd('time:indexer#processBlockAfterEvents-mapping_code');

    console.time('time:indexer#processBlockAfterEvents-dump_subgraph_state');

    // Persist subgraph state to the DB.
    await this.dumpSubgraphState(blockHash);

    console.timeEnd('time:indexer#processBlockAfterEvents-dump_subgraph_state');
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    const { topics, data } = logObj;

    const contract = this._contractMap.get(kind);
    assert(contract);

    const logDescription = contract.parseLog({ data, topics });

    const { eventName, eventInfo, eventSignature } = this._baseIndexer.parseEvent(logDescription);

    return {
      eventName,
      eventInfo,
      eventSignature
    };
  }

  async getStateSyncStatus (): Promise<StateSyncStatus | undefined> {
    return this._db.getStateSyncStatus();
  }

  async updateStateSyncStatusIndexedBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateStateSyncStatusIndexedBlock(dbTx, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateStateSyncStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateStateSyncStatusCheckpointBlock(dbTx, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getLatestCanonicalBlock (): Promise<BlockProgress> {
    const syncStatus = await this.getSyncStatus();
    assert(syncStatus);

    const latestCanonicalBlock = await this.getBlockProgress(syncStatus.latestCanonicalBlockHash);
    assert(latestCanonicalBlock);

    return latestCanonicalBlock;
  }

  async getLatestStateIndexedBlock (): Promise<BlockProgress> {
    return this._baseIndexer.getLatestStateIndexedBlock();
  }

  async addContracts (): Promise<void> {
    // Watching all the contracts in the subgraph.
    await this._graphWatcher.addContracts();
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

  async getEventsByFilter (blockHash: string, contract?: string, name?: string): Promise<Array<Event>> {
    return this._baseIndexer.getEventsByFilter(blockHash, contract, name);
  }

  isWatchedContract (address : string): Contract | undefined {
    return this._baseIndexer.isWatchedContract(address);
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._baseIndexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    return this._baseIndexer.getEventsInRange(fromBlockNumber, toBlockNumber);
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._baseIndexer.getSyncStatus();
  }

  async getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any> {
    return this._baseIndexer.getBlocks(blockFilter);
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusIndexedBlock(blockHash, blockNumber, force);
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusChainHead(blockHash, blockNumber, force);
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const syncStatus = this._baseIndexer.updateSyncStatusCanonicalBlock(blockHash, blockNumber, force);
    await this.pruneFrothyEntities(blockNumber);

    return syncStatus;
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
    await this._baseIndexer.markBlocksAsPruned(blocks);

    await this._graphWatcher.pruneEntities(FrothyEntity, blocks, SUBGRAPH_ENTITIES);
  }

  async pruneFrothyEntities (blockNumber: number): Promise<void> {
    await this._graphWatcher.pruneFrothyEntities(FrothyEntity, blockNumber);
  }

  async resetLatestEntities (blockNumber: number): Promise<void> {
    await this._graphWatcher.resetLatestEntities(blockNumber);

    await this.resetLatestEntities(blockNumber);
  }

  async updateBlockProgress (block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    return this._baseIndexer.updateBlockProgress(block, lastProcessedEventIndex);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseIndexer.getAncestorAtDepth(blockHash, depth);
  }

  getEntityTypesMap (): Map<string, { [key: string]: string }> {
    return this._entityTypesMap;
  }

  getRelationsMap (): Map<any, { [key: string]: any }> {
    return this._relationsMap;
  }

  updateSubgraphState (contractAddress: string, data: any): void {
    return updateSubgraphState(this._subgraphStateMap, contractAddress, data);
  }

  async dumpSubgraphState (blockHash: string, isStateFinalized = false): Promise<void> {
    return dumpSubgraphState(this, this._subgraphStateMap, blockHash, isStateFinalized);
  }

  async resetWatcherToBlock (blockNumber: number): Promise<void> {
    const entities = [...ENTITIES, FrothyEntity];
    await this._baseIndexer.resetWatcherToBlock(blockNumber, entities);
  }

  _populateEntityTypesMap (): void {
    this._entityTypesMap.set(
      'Producer',
      {
        id: 'ID',
        active: 'Boolean',
        rewardCollector: 'Bytes',
        rewards: 'BigInt',
        confirmedBlocks: 'BigInt',
        pendingEpochBlocks: 'BigInt'
      }
    );

    this._entityTypesMap.set(
      'ProducerSet',
      {
        id: 'ID',
        producers: 'Producer'
      }
    );

    this._entityTypesMap.set(
      'ProducerSetChange',
      {
        id: 'ID',
        blockNumber: 'BigInt',
        producer: 'Bytes',
        changeType: 'ProducerSetChangeType'
      }
    );

    this._entityTypesMap.set(
      'ProducerRewardCollectorChange',
      {
        id: 'ID',
        blockNumber: 'BigInt',
        producer: 'Bytes',
        rewardCollector: 'Bytes'
      }
    );

    this._entityTypesMap.set(
      'RewardScheduleEntry',
      {
        id: 'ID',
        startTime: 'BigInt',
        epochDuration: 'BigInt',
        rewardsPerEpoch: 'BigInt'
      }
    );

    this._entityTypesMap.set(
      'RewardSchedule',
      {
        id: 'ID',
        rewardScheduleEntries: 'RewardScheduleEntry',
        lastEpoch: 'Epoch',
        pendingEpoch: 'Epoch',
        activeRewardScheduleEntry: 'RewardScheduleEntry'
      }
    );

    this._entityTypesMap.set(
      'Block',
      {
        id: 'ID',
        fromActiveProducer: 'Boolean',
        hash: 'Bytes',
        parentHash: 'Bytes',
        unclesHash: 'Bytes',
        author: 'Bytes',
        stateRoot: 'Bytes',
        transactionsRoot: 'Bytes',
        receiptsRoot: 'Bytes',
        number: 'BigInt',
        gasUsed: 'BigInt',
        gasLimit: 'BigInt',
        timestamp: 'BigInt',
        difficulty: 'BigInt',
        totalDifficulty: 'BigInt',
        size: 'BigInt'
      }
    );

    this._entityTypesMap.set(
      'Epoch',
      {
        id: 'ID',
        finalized: 'Boolean',
        epochNumber: 'BigInt',
        startBlock: 'Block',
        endBlock: 'Block',
        producerBlocks: 'BigInt',
        allBlocks: 'BigInt',
        producerBlocksRatio: 'BigDecimal'
      }
    );

    this._entityTypesMap.set(
      'ProducerEpoch',
      {
        id: 'ID',
        address: 'Bytes',
        epoch: 'Epoch',
        totalRewards: 'BigInt',
        blocksProduced: 'BigInt',
        blocksProducedRatio: 'BigDecimal'
      }
    );

    this._entityTypesMap.set(
      'SlotClaim',
      {
        id: 'ID',
        slot: 'Slot',
        owner: 'Bytes',
        winningBid: 'BigInt',
        oldBid: 'BigInt',
        startTime: 'BigInt',
        expirationTime: 'BigInt',
        taxRatePerDay: 'BigDecimal'
      }
    );

    this._entityTypesMap.set(
      'Slot',
      {
        id: 'ID',
        owner: 'Bytes',
        delegate: 'Bytes',
        winningBid: 'BigInt',
        oldBid: 'BigInt',
        startTime: 'BigInt',
        expirationTime: 'BigInt',
        taxRatePerDay: 'BigDecimal'
      }
    );

    this._entityTypesMap.set(
      'Staker',
      {
        id: 'ID',
        staked: 'BigInt',
        rank: 'BigInt'
      }
    );

    this._entityTypesMap.set(
      'Network',
      {
        id: 'ID',
        slot0: 'Slot',
        slot1: 'Slot',
        slot2: 'Slot',
        stakers: 'Staker',
        numStakers: 'BigInt',
        totalStaked: 'BigInt',
        stakedPercentiles: 'BigInt'
      }
    );

    this._entityTypesMap.set(
      'Distributor',
      {
        id: 'ID',
        currentDistribution: 'Distribution'
      }
    );

    this._entityTypesMap.set(
      'Distribution',
      {
        id: 'ID',
        distributor: 'Distributor',
        timestamp: 'BigInt',
        distributionNumber: 'BigInt',
        merkleRoot: 'Bytes',
        metadataURI: 'String'
      }
    );

    this._entityTypesMap.set(
      'Claim',
      {
        id: 'ID',
        timestamp: 'BigInt',
        index: 'BigInt',
        account: 'Account',
        totalEarned: 'BigInt',
        claimed: 'BigInt'
      }
    );

    this._entityTypesMap.set(
      'Account',
      {
        id: 'ID',
        totalClaimed: 'BigInt',
        totalSlashed: 'BigInt'
      }
    );

    this._entityTypesMap.set(
      'Slash',
      {
        id: 'ID',
        timestamp: 'BigInt',
        account: 'Account',
        slashed: 'BigInt'
      }
    );
  }

  _populateRelationsMap (): void {
    this._relationsMap.set(ProducerSet, {
      producers: {
        entity: Producer,
        isArray: true,
        isDerived: false
      }
    });

    this._relationsMap.set(RewardSchedule, {
      rewardScheduleEntries: {
        entity: RewardScheduleEntry,
        isArray: true,
        isDerived: false
      },
      lastEpoch: {
        entity: Epoch,
        isArray: false,
        isDerived: false
      },
      pendingEpoch: {
        entity: Epoch,
        isArray: false,
        isDerived: false
      },
      activeRewardScheduleEntry: {
        entity: RewardScheduleEntry,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(ProducerEpoch, {
      epoch: {
        entity: Epoch,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Epoch, {
      startBlock: {
        entity: Block,
        isArray: false,
        isDerived: false
      },
      endBlock: {
        entity: Block,
        isArray: false,
        isDerived: false
      },
      producerRewards: {
        entity: ProducerEpoch,
        isArray: true,
        isDerived: true,
        field: 'epoch'
      }
    });

    this._relationsMap.set(SlotClaim, {
      slot: {
        entity: Slot,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Network, {
      slot0: {
        entity: Slot,
        isArray: false,
        isDerived: false
      },
      slot1: {
        entity: Slot,
        isArray: false,
        isDerived: false
      },
      slot2: {
        entity: Slot,
        isArray: false,
        isDerived: false
      },
      stakers: {
        entity: Staker,
        isArray: true,
        isDerived: false
      }
    });

    this._relationsMap.set(Distributor, {
      currentDistribution: {
        entity: Distribution,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Distribution, {
      distributor: {
        entity: Distributor,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Claim, {
      account: {
        entity: Account,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Slash, {
      account: {
        entity: Account,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Slot, {
      claims: {
        entity: SlotClaim,
        isArray: true,
        isDerived: true,
        field: 'slot'
      }
    });

    this._relationsMap.set(Account, {
      claims: {
        entity: Claim,
        isArray: true,
        isDerived: true,
        field: 'account'
      },
      slashes: {
        entity: Slash,
        isArray: true,
        isDerived: true,
        field: 'account'
      }
    });
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

      console.time(`time:indexer#_saveBlockAndFetchEvents-db-save-${blockNumber}`);
      const blockProgress = await this._db.saveBlockWithEvents(dbTx, block, dbEvents);
      await dbTx.commitTransaction();
      console.timeEnd(`time:indexer#_saveBlockAndFetchEvents-db-save-${blockNumber}`);

      return [blockProgress, []];
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }
}
