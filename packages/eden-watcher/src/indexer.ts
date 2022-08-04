//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';

import { JsonFragment } from '@ethersproject/abi';
import { BaseProvider } from '@ethersproject/providers';
import * as codec from '@ipld/dag-cbor';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { StorageLayout } from '@vulcanize/solidity-mapper';
import {
  IPLDIndexer as BaseIndexer,
  UNKNOWN_EVENT_NAME,
  ServerConfig,
  JobQueue,
  Where,
  QueryOptions,
  BlockHeight,
  IPFSClient,
  StateKind,
  IPLDIndexerInterface,
  IpldStatus as IpldStatusInterface
} from '@vulcanize/util';
import { GraphWatcher } from '@vulcanize/graph-node';

import { Database } from './database';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { IpldStatus } from './entity/IpldStatus';
import { BlockProgress } from './entity/BlockProgress';
import { IPLDBlock } from './entity/IPLDBlock';
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

const log = debug('vulcanize:indexer');

const KIND_EDENNETWORK = 'EdenNetwork';
const KIND_MERKLEDISTRIBUTOR = 'EdenNetworkDistribution';
const KIND_DISTRIBUTORGOVERNANCE = 'EdenNetworkGovernance';

export type ResultEvent = {
  block: {
    cid: string;
    hash: string;
    number: number;
    timestamp: number;
    parentHash: string;
  };
  tx: {
    hash: string;
    from: string;
    to: string;
    index: number;
  };

  contract: string;

  eventIndex: number;
  eventSignature: string;
  event: any;

  proof: string;
};

export type ResultIPLDBlock = {
  block: {
    cid: string;
    hash: string;
    number: number;
    timestamp: number;
    parentHash: string;
  };
  contractAddress: string;
  cid: string;
  kind: string;
  data: string;
};

export class Indexer implements IPLDIndexerInterface {
  _db: Database
  _ethClient: EthClient
  _ethProvider: BaseProvider
  _baseIndexer: BaseIndexer
  _serverConfig: ServerConfig
  _graphWatcher: GraphWatcher;

  _abiMap: Map<string, JsonFragment[]>
  _storageLayoutMap: Map<string, StorageLayout>
  _contractMap: Map<string, ethers.utils.Interface>

  _ipfsClient: IPFSClient

  _entityTypesMap: Map<string, { [key: string]: string }>
  _relationsMap: Map<any, { [key: string]: any }>

  constructor (serverConfig: ServerConfig, db: Database, ethClient: EthClient, ethProvider: BaseProvider, jobQueue: JobQueue, graphWatcher: GraphWatcher) {
    assert(db);
    assert(ethClient);

    this._db = db;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._ipfsClient = new IPFSClient(this._serverConfig.ipfsApiAddr);
    this._baseIndexer = new BaseIndexer(this._serverConfig, this._db, this._ethClient, this._ethProvider, jobQueue, this._ipfsClient);
    this._graphWatcher = graphWatcher;

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
  }

  get serverConfig (): ServerConfig {
    return this._serverConfig;
  }

  async init (): Promise<void> {
    await this._baseIndexer.fetchContracts();
    await this._baseIndexer.fetchIPLDStatus();
  }

  getResultEvent (event: Event): ResultEvent {
    const block = event.block;
    const eventFields = JSONbig.parse(event.eventInfo);
    const { tx, eventSignature } = JSON.parse(event.extraInfo);

    return {
      block: {
        cid: block.cid,
        hash: block.blockHash,
        number: block.blockNumber,
        timestamp: block.blockTimestamp,
        parentHash: block.parentHash
      },

      tx: {
        hash: event.txHash,
        from: tx.src,
        to: tx.dst,
        index: tx.index
      },

      contract: event.contract,

      eventIndex: event.index,
      eventSignature,
      event: {
        __typename: `${event.eventName}Event`,
        ...eventFields
      },

      // TODO: Return proof only if requested.
      proof: JSON.parse(event.proof)
    };
  }

  getResultIPLDBlock (ipldBlock: IPLDBlock): ResultIPLDBlock {
    const block = ipldBlock.block;

    const data = codec.decode(Buffer.from(ipldBlock.data)) as any;

    return {
      block: {
        cid: block.cid,
        hash: block.blockHash,
        number: block.blockNumber,
        timestamp: block.blockTimestamp,
        parentHash: block.parentHash
      },
      contractAddress: ipldBlock.contractAddress,
      cid: ipldBlock.cid,
      kind: ipldBlock.kind,
      data: JSON.stringify(data)
    };
  }

  async pushToIPFS (data: any): Promise<void> {
    await this._baseIndexer.pushToIPFS(data);
  }

  async processInitialState (contractAddress: string, blockHash: string): Promise<any> {
    // Call initial state hook.
    return createInitialState(this, contractAddress, blockHash);
  }

  async processStateCheckpoint (contractAddress: string, blockHash: string): Promise<boolean> {
    // Call checkpoint hook.
    return createStateCheckpoint(this, contractAddress, blockHash);
  }

  async processCanonicalBlock (blockHash: string): Promise<void> {
    console.time('time:indexer#processCanonicalBlock-finalize_auto_diffs');

    // Finalize staged diff blocks if any.
    await this._baseIndexer.finalizeDiffStaged(blockHash);

    console.timeEnd('time:indexer#processCanonicalBlock-finalize_auto_diffs');

    // Call custom stateDiff hook.
    await createStateDiff(this, blockHash);
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

  async getPrevIPLDBlock (blockHash: string, contractAddress: string, kind?: string): Promise<IPLDBlock | undefined> {
    return this._db.getPrevIPLDBlock(blockHash, contractAddress, kind);
  }

  async getLatestIPLDBlock (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<IPLDBlock | undefined> {
    return this._db.getLatestIPLDBlock(contractAddress, kind, blockNumber);
  }

  async getIPLDBlocksByHash (blockHash: string): Promise<IPLDBlock[]> {
    return this._baseIndexer.getIPLDBlocksByHash(blockHash);
  }

  async getIPLDBlockByCid (cid: string): Promise<IPLDBlock | undefined> {
    return this._baseIndexer.getIPLDBlockByCid(cid);
  }

  getIPLDData (ipldBlock: IPLDBlock): any {
    return this._baseIndexer.getIPLDData(ipldBlock);
  }

  isIPFSConfigured (): boolean {
    return this._baseIndexer.isIPFSConfigured();
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

  // Method to be used by checkpoint CLI.
  async createCheckpoint (contractAddress: string, blockHash: string): Promise<string | undefined> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._baseIndexer.createCheckpoint(this, contractAddress, block);
  }

  async saveOrUpdateIPLDBlock (ipldBlock: IPLDBlock): Promise<IPLDBlock> {
    return this._baseIndexer.saveOrUpdateIPLDBlock(ipldBlock);
  }

  async removeIPLDBlocks (blockNumber: number, kind: StateKind): Promise<void> {
    await this._baseIndexer.removeIPLDBlocks(blockNumber, kind);
  }

  async getSubgraphEntity<Entity> (entity: new () => Entity, id: string, block?: BlockHeight): Promise<any> {
    const relations = this._relationsMap.get(entity) || {};

    const data = await this._graphWatcher.getEntity(entity, id, relations, block);

    return data;
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

  async processBlock (blockHash: string, blockNumber: number): Promise<void> {
    console.time('time:indexer#processBlock-init_state');

    // Call a function to create initial state for contracts.
    await this._baseIndexer.createInit(this, blockHash, blockNumber);

    console.timeEnd('time:indexer#processBlock-init_state');

    console.time('time:indexer#processBlock-mapping_code');

    // Call subgraph handler for block.
    await this._graphWatcher.handleBlock(blockHash);

    console.timeEnd('time:indexer#processBlock-mapping_code');
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    const { topics, data } = logObj;

    const contract = this._contractMap.get(kind);
    assert(contract);

    const logDescription = contract.parseLog({ data, topics });

    const { eventName, eventInfo } = this._baseIndexer.parseEvent(logDescription);

    return {
      eventName,
      eventInfo,
      eventSignature: logDescription.signature
    };
  }

  async getIPLDStatus (): Promise<IpldStatus | undefined> {
    return this._db.getIPLDStatus();
  }

  async updateIPLDStatusHooksBlock (blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateIPLDStatusHooksBlock(dbTx, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateIPLDStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateIPLDStatusCheckpointBlock(dbTx, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateIPLDStatusIPFSBlock (blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateIPLDStatusIPFSBlock(dbTx, blockNumber, force);
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

  async getLatestHooksProcessedBlock (): Promise<BlockProgress> {
    return this._baseIndexer.getLatestHooksProcessedBlock();
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
    await this.updateIPLDStatusMap(address, {});

    return this._baseIndexer.watchContract(address, kind, checkpoint, startingBlock);
  }

  async updateIPLDStatusMap (address: string, ipldStatus: IpldStatusInterface): Promise<void> {
    await this._baseIndexer.updateIPLDStatusMap(address, ipldStatus);
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

  async isWatchedContract (address : string): Promise<Contract | undefined> {
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
    return this._baseIndexer.updateSyncStatusCanonicalBlock(blockHash, blockNumber, force);
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

  async fetchBlockEvents (block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    return this._baseIndexer.fetchBlockEvents(block, this._fetchAndSaveEvents.bind(this));
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<Event>> {
    return this._baseIndexer.getBlockEvents(blockHash, where, queryOptions);
  }

  async removeUnknownEvents (block: BlockProgress): Promise<void> {
    return this._baseIndexer.removeUnknownEvents(Event, block);
  }

  async markBlocksAsPruned (blocks: BlockProgress[]): Promise<void> {
    return this._baseIndexer.markBlocksAsPruned(blocks);
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
    // Needs to be generated by codegen.
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

  async _fetchAndSaveEvents ({ cid: blockCid, blockHash }: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    assert(blockHash);
    const transactionsPromise = this._ethClient.getBlockWithTransactions({ blockHash });
    const blockPromise = this._ethClient.getBlockByHash(blockHash);
    let logs: any[];

    if (this._serverConfig.filterLogs) {
      const watchedContracts = this._baseIndexer.getWatchedContracts();

      // TODO: Query logs by multiple contracts.
      const contractlogsPromises = watchedContracts.map((watchedContract): Promise<any> => this._ethClient.getLogs({
        blockHash,
        contract: watchedContract.address
      }));

      const contractlogs = await Promise.all(contractlogsPromises);

      // Flatten logs by contract and sort by index.
      logs = contractlogs.map(data => {
        return data.logs;
      }).flat()
        .sort((a, b) => {
          return a.index - b.index;
        });
    } else {
      ({ logs } = await this._ethClient.getLogs({ blockHash }));
    }

    let [
      { block },
      {
        allEthHeaderCids: {
          nodes: [
            {
              ethTransactionCidsByHeaderId: {
                nodes: transactions
              }
            }
          ]
        }
      }
    ] = await Promise.all([blockPromise, transactionsPromise]);

    const transactionMap = transactions.reduce((acc: {[key: string]: any}, transaction: {[key: string]: any}) => {
      acc[transaction.txHash] = transaction;
      return acc;
    }, {});

    const dbEvents: Array<DeepPartial<Event>> = [];

    for (let li = 0; li < logs.length; li++) {
      const logObj = logs[li];
      const {
        topics,
        data,
        index: logIndex,
        cid,
        ipldBlock,
        account: {
          address
        },
        transaction: {
          hash: txHash
        },
        receiptCID,
        status
      } = logObj;

      if (status) {
        let eventName = UNKNOWN_EVENT_NAME;
        let eventInfo = {};
        const tx = transactionMap[txHash];
        const extraInfo: { [key: string]: any } = { topics, data, tx };

        const contract = ethers.utils.getAddress(address);
        const watchedContract = await this.isWatchedContract(contract);

        if (watchedContract) {
          const eventDetails = this.parseEventNameAndArgs(watchedContract.kind, logObj);
          eventName = eventDetails.eventName;
          eventInfo = eventDetails.eventInfo;
          extraInfo.eventSignature = eventDetails.eventSignature;
        }

        dbEvents.push({
          index: logIndex,
          txHash,
          contract,
          eventName,
          eventInfo: JSONbig.stringify(eventInfo),
          extraInfo: JSONbig.stringify(extraInfo),
          proof: JSONbig.stringify({
            data: JSONbig.stringify({
              blockHash,
              receiptCID,
              log: {
                cid,
                ipldBlock
              }
            })
          })
        });
      } else {
        log(`Skipping event for receipt ${receiptCID} due to failed transaction.`);
      }
    }

    const dbTx = await this._db.createTransactionRunner();

    try {
      block = {
        cid: blockCid,
        blockHash,
        blockNumber: block.number,
        blockTimestamp: block.timestamp,
        parentHash: block.parent.hash
      };

      const blockProgress = await this._db.saveEvents(dbTx, block, dbEvents);
      await dbTx.commitTransaction();

      return blockProgress;
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }
}
