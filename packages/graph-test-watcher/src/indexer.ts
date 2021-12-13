//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';

import { JsonFragment } from '@ethersproject/abi';
import { BaseProvider } from '@ethersproject/providers';
import * as codec from '@ipld/dag-cbor';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { StorageLayout } from '@vulcanize/solidity-mapper';
import {
  EventInterface,
  IPLDIndexer as BaseIndexer,
  IndexerInterface,
  ValueResult,
  UNKNOWN_EVENT_NAME,
  ServerConfig,
  updateStateForElementaryType,
  JobQueue,
  BlockHeight,
  IPFSClient
} from '@vulcanize/util';
import { GraphWatcher } from '@vulcanize/graph-node';

import { Database } from './database';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { HookStatus } from './entity/HookStatus';
import { BlockProgress } from './entity/BlockProgress';
import { IPLDBlock } from './entity/IPLDBlock';
import artifacts from './artifacts/Example.json';
import { createInitialState, handleEvent, createStateDiff, createStateCheckpoint } from './hooks';
import { Author } from './entity/Author';
import { Blog } from './entity/Blog';
import { Category } from './entity/Category';

const log = debug('vulcanize:indexer');

const TEST_EVENT = 'Test';

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

export class Indexer implements IndexerInterface {
  _db: Database
  _ethClient: EthClient
  _ethProvider: BaseProvider
  _postgraphileClient: EthClient
  _baseIndexer: BaseIndexer
  _serverConfig: ServerConfig
  _graphWatcher: GraphWatcher;

  _abi: JsonFragment[]
  _storageLayout: StorageLayout
  _contract: ethers.utils.Interface

  _ipfsClient: IPFSClient

  _entityTypesMap: Map<string, { [key: string]: string }>
  _relationsMap: Map<any, { [key: string]: any }>

  constructor (serverConfig: ServerConfig, db: Database, ethClient: EthClient, postgraphileClient: EthClient, ethProvider: BaseProvider, jobQueue: JobQueue, graphWatcher: GraphWatcher) {
    assert(db);
    assert(ethClient);
    assert(postgraphileClient);

    this._db = db;
    this._ethClient = ethClient;
    this._postgraphileClient = postgraphileClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._ipfsClient = new IPFSClient(this._serverConfig.ipfsApiAddr);
    this._baseIndexer = new BaseIndexer(this._serverConfig, this._db, this._ethClient, this._postgraphileClient, this._ethProvider, jobQueue, this._ipfsClient);
    this._graphWatcher = graphWatcher;

    const { abi, storageLayout } = artifacts;

    assert(abi);
    assert(storageLayout);

    this._abi = abi;
    this._storageLayout = storageLayout;

    this._contract = new ethers.utils.Interface(this._abi);

    this._entityTypesMap = new Map();
    this._populateEntityTypesMap();

    this._relationsMap = new Map();
    this._populateRelationsMap();
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

  async getMethod (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const entity = await this._db.getGetMethod({ blockHash, contractAddress });
    if (entity) {
      log('getMethod: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('getMethod: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const contract = new ethers.Contract(contractAddress, this._abi, this._ethProvider);
    const value = await contract.getMethod({ blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveGetMethod({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbig.stringify(result.proof) });

    return result;
  }

  async _test (blockHash: string, contractAddress: string, diff = false): Promise<ValueResult> {
    const entity = await this._db._getTest({ blockHash, contractAddress });
    if (entity) {
      log('_test: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_test: db miss, fetching from upstream server');

    const { block: { number } } = await this._ethClient.getBlockByHash(blockHash);
    const blockNumber = ethers.BigNumber.from(number).toNumber();

    const result = await this._baseIndexer.getStorageValue(
      this._storageLayout,
      blockHash,
      contractAddress,
      '_test'
    );

    await this._db._saveTest({ blockHash, blockNumber, contractAddress, value: result.value, proof: JSONbig.stringify(result.proof) });

    if (diff) {
      const stateUpdate = updateStateForElementaryType({}, '_test', result.value.toString());
      await this.createDiffStaged(contractAddress, blockHash, stateUpdate);
    }

    return result;
  }

  async pushToIPFS (data: any): Promise<void> {
    await this._baseIndexer.pushToIPFS(data);
  }

  async processCanonicalBlock (job: any): Promise<void> {
    const { data: { blockHash } } = job;

    // Finalize staged diff blocks if any.
    await this._baseIndexer.finalizeDiffStaged(blockHash);

    // Call custom stateDiff hook.
    await createStateDiff(this, blockHash);
  }

  async processCheckpoint (job: any): Promise<void> {
    // Return if checkpointInterval is <= 0.
    const checkpointInterval = this._serverConfig.checkpointInterval;
    if (checkpointInterval <= 0) return;

    const { data: { blockHash } } = job;
    await this._baseIndexer.processCheckpoint(this, blockHash, checkpointInterval);
  }

  async processCLICheckpoint (contractAddress: string, blockHash?: string): Promise<string | undefined> {
    return this._baseIndexer.processCLICheckpoint(this, contractAddress, blockHash);
  }

  async getPrevIPLDBlock (blockHash: string, contractAddress: string, kind?: string): Promise<IPLDBlock | undefined> {
    return this._db.getPrevIPLDBlock(blockHash, contractAddress, kind);
  }

  async getLatestIPLDBlock (contractAddress: string, kind: string | null, blockNumber?: number): Promise<IPLDBlock | undefined> {
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

  async createInitialState (contractAddress: string, blockHash: string): Promise<any> {
    return createInitialState(this, contractAddress, blockHash);
  }

  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    await this._baseIndexer.createDiffStaged(contractAddress, blockHash, data);
  }

  async createDiff (contractAddress: string, blockHash: string, data: any): Promise<void> {
    await this._baseIndexer.createDiff(contractAddress, blockHash, data);
  }

  async createStateCheckpoint (contractAddress: string, blockHash: string): Promise<boolean> {
    return createStateCheckpoint(this, contractAddress, blockHash);
  }

  async createCheckpoint (contractAddress: string, blockHash?: string, data?: any, checkpointInterval?: number): Promise<string | undefined> {
    return this._baseIndexer.createCheckpoint(this, contractAddress, blockHash, data, checkpointInterval);
  }

  async saveOrUpdateIPLDBlock (ipldBlock: IPLDBlock): Promise<IPLDBlock> {
    return this._baseIndexer.saveOrUpdateIPLDBlock(ipldBlock);
  }

  async removeIPLDBlocks (blockNumber: number, kind: string): Promise<void> {
    await this._baseIndexer.removeIPLDBlocks(blockNumber, kind);
  }

  async getSubgraphEntity<Entity> (entity: new () => Entity, id: string, block: BlockHeight): Promise<Entity | undefined> {
    const relations = this._relationsMap.get(entity) || {};

    const data = await this._graphWatcher.getEntity(entity, id, relations, block);

    return data;
  }

  async triggerIndexingOnEvent (event: Event): Promise<void> {
    const resultEvent = this.getResultEvent(event);

    // Call subgraph handler for event.
    await this._graphWatcher.handleEvent(resultEvent);

    // Call custom hook function for indexing on event.
    await handleEvent(this, resultEvent);
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);
  }

  async processBlock (blockHash: string, blockNumber: number): Promise<void> {
    // Call a function to create initial state for contracts.
    await this._baseIndexer.createInit(this, blockHash, blockNumber);

    // Call subgraph handler for block.
    await this._graphWatcher.handleBlock(blockHash);
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    let eventName = UNKNOWN_EVENT_NAME;
    let eventInfo = {};

    const { topics, data } = logObj;
    const logDescription = this._contract.parseLog({ data, topics });

    switch (logDescription.name) {
      case TEST_EVENT: {
        eventName = logDescription.name;
        const { param1, param2, param3 } = logDescription.args;
        eventInfo = {
          param1,
          param2,
          param3: BigInt(param3.toString())
        };

        break;
      }
    }

    return {
      eventName,
      eventInfo,
      eventSignature: logDescription.signature
    };
  }

  async getHookStatus (): Promise<HookStatus | undefined> {
    return this._db.getHookStatus();
  }

  async updateHookStatusProcessedBlock (blockNumber: number, force?: boolean): Promise<HookStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateHookStatusProcessedBlock(dbTx, blockNumber, force);
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
    const hookStatus = await this.getHookStatus();
    assert(hookStatus);

    return this._baseIndexer.getLatestHooksProcessedBlock(hookStatus);
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
    return this._baseIndexer.watchContract(address, kind, checkpoint, startingBlock);
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

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusChainHead(blockHash, blockNumber);
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

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlocksAtHeight(height, isPruned);
  }

  async getOrFetchBlockEvents (block: DeepPartial<BlockProgress>): Promise<Array<EventInterface>> {
    return this._baseIndexer.getOrFetchBlockEvents(block, this._fetchAndSaveEvents.bind(this));
  }

  async getBlockEvents (blockHash: string): Promise<Array<Event>> {
    return this._baseIndexer.getBlockEvents(blockHash);
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
      'Author',
      {
        id: 'ID',
        blogCount: 'BigInt',
        name: 'String',
        rating: 'BigDecimal',
        paramInt: 'Int',
        paramBigInt: 'BigInt',
        paramBytes: 'Bytes'
      }
    );

    this._entityTypesMap.set(
      'Blog',
      {
        id: 'ID',
        kind: 'BlogKind',
        isActive: 'Boolean',
        reviews: 'BigInt',
        author: 'Author',
        categories: 'Category'
      }
    );

    this._entityTypesMap.set(
      'Category',
      {
        id: 'ID',
        name: 'String',
        count: 'BigInt'
      }
    );
  }

  _populateRelationsMap (): void {
    // Needs to be generated by codegen.
    this._relationsMap.set(Author, {
      blogs: {
        entity: Blog,
        isDerived: true,
        isArray: true,
        field: 'author'
      }
    });

    this._relationsMap.set(Blog, {
      author: {
        entity: Author,
        isDerived: false,
        isArray: false
      },
      categories: {
        entity: Category,
        isDerived: false,
        isArray: true
      }
    });
  }

  async _fetchAndSaveEvents ({ cid: blockCid, blockHash }: DeepPartial<BlockProgress>): Promise<void> {
    assert(blockHash);
    let { block, logs } = await this._ethClient.getLogs({ blockHash });

    const {
      allEthHeaderCids: {
        nodes: [
          {
            ethTransactionCidsByHeaderId: {
              nodes: transactions
            }
          }
        ]
      }
    } = await this._postgraphileClient.getBlockWithTransactions({ blockHash });

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

      await this._db.saveEvents(dbTx, block, dbEvents);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }
}
