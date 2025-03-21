//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { DeepPartial, EntityTarget, Equal, FindConditions, FindManyOptions, MoreThan } from 'typeorm';
import debug from 'debug';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import _ from 'lodash';

// @ts-expect-error TODO: Resolve (Not able to find the type declarations)
import * as codec from '@ipld/dag-cbor';
import { GetStorageAt, getStorageValue, StorageLayout } from '@cerc-io/solidity-mapper';

import {
  BlockProgressInterface,
  DatabaseInterface,
  IndexerInterface,
  EventInterface,
  ContractInterface,
  SyncStatusInterface,
  StateInterface,
  StateKind,
  EthClient,
  ContractJobData,
  EventsQueueJobKind,
  EthFullBlock,
  EthFullTransaction
} from './types';
import { UNKNOWN_EVENT_NAME, QUEUE_EVENT_PROCESSING, DIFF_MERGE_BATCH_SIZE } from './constants';
import { JobQueue } from './job-queue';
import { Where, QueryOptions, BlockHeight } from './database';
import { ServerConfig, UpstreamConfig } from './config';
import { createOrUpdateStateData, StateDataMeta } from './state-helper';
import { ethRpcRequestDuration, setActiveUpstreamEndpointMetric } from './metrics';

const DEFAULT_MAX_EVENTS_BLOCK_RANGE = 1000;

const log = debug('vulcanize:indexer');
const JSONbigNative = JSONbig({ useNativeBigInt: true });

export interface ValueResult {
  value: any;
  proof?: {
    data: string;
  }
}

export interface StateStatus {
  init?: number;
  diff?: number;
  checkpoint?: number;
  // eslint-disable-next-line camelcase
  diff_staged?: number;
}

export type ResultState = {
  block: {
    cid: string | null;
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

export type ResultEvent = {
  block: {
    cid: string | null;
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

export type ResultMeta = {
  block: {
    hash: string | null;
    number: number;
    timestamp: number | null;
  };
  deployment: string;
  hasIndexingErrors: boolean;
};

export type ExtraEventData = {
  ethFullBlock: EthFullBlock;
  ethFullTransactions: EthFullTransaction[];
}

export class Indexer {
  _serverConfig: ServerConfig;
  _upstreamConfig: UpstreamConfig;
  _db: DatabaseInterface;
  _ethClient: EthClient;
  _getStorageAt: GetStorageAt;
  _ethProvider: ethers.providers.JsonRpcProvider;
  _jobQueue: JobQueue;

  _watchedContractsByAddressMap: { [key: string]: ContractInterface[] } = {};
  _stateStatusMap: { [key: string]: StateStatus } = {};

  _currentEndpointIndex = {
    rpcProviderEndpoint: 0
  };

  constructor (
    config: {
      server: ServerConfig;
      upstream: UpstreamConfig;
    },
    db: DatabaseInterface,
    ethClient: EthClient,
    ethProvider: ethers.providers.JsonRpcProvider,
    jobQueue: JobQueue
  ) {
    this._serverConfig = config.server;
    this._upstreamConfig = config.upstream;
    this._db = db;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._jobQueue = jobQueue;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);

    setActiveUpstreamEndpointMetric(
      this._upstreamConfig,
      this._currentEndpointIndex.rpcProviderEndpoint
    );
  }

  async switchClients (
    initClients: (upstreamConfig: UpstreamConfig, endpointIndexes: typeof this._currentEndpointIndex) => Promise<{
      ethClient: EthClient,
      ethProvider: ethers.providers.JsonRpcProvider
    }>
  ): Promise<{ ethClient: EthClient, ethProvider: ethers.providers.JsonRpcProvider }> {
    const oldRpcEndpoint = this._upstreamConfig.ethServer.rpcProviderEndpoints[this._currentEndpointIndex.rpcProviderEndpoint];
    ++this._currentEndpointIndex.rpcProviderEndpoint;

    if (this._currentEndpointIndex.rpcProviderEndpoint === this._upstreamConfig.ethServer.rpcProviderEndpoints.length) {
      this._currentEndpointIndex.rpcProviderEndpoint = 0;
    }

    const { ethClient, ethProvider } = await initClients(this._upstreamConfig, this._currentEndpointIndex);
    setActiveUpstreamEndpointMetric(
      this._upstreamConfig,
      this._currentEndpointIndex.rpcProviderEndpoint
    );

    const newRpcEndpoint = ethProvider.connection.url;
    log(`Switching RPC endpoint from ${oldRpcEndpoint} to endpoint ${newRpcEndpoint}`);

    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    return { ethClient, ethProvider };
  }

  async isGetLogsRequestsSlow (): Promise<boolean> {
    const threshold = this._upstreamConfig.ethServer.getLogsClientSwitchThresholdInSecs;

    if (threshold) {
      const getLogsLabels = {
        method: 'eth_getLogs',
        provider: this._ethProvider.connection.url
      };

      const ethRpcRequestDurationMetrics = await ethRpcRequestDuration.get();

      const currentProviderDuration = ethRpcRequestDurationMetrics.values.find(
        val => val.labels.method === getLogsLabels.method && val.labels.provider === getLogsLabels.provider
      );

      if (currentProviderDuration) {
        return currentProviderDuration.value > threshold;
      }
    }

    return false;
  }

  async fetchContracts (): Promise<void> {
    assert(this._db.getContracts);

    const contracts = await this._db.getContracts();

    this._watchedContractsByAddressMap = contracts.reduce((acc: { [key: string]: ContractInterface[] }, contract) => {
      if (!acc[contract.address]) {
        acc[contract.address] = [];
      }

      acc[contract.address].push(contract);

      return acc;
    }, {});
  }

  async getMetaData (block: BlockHeight): Promise<ResultMeta | null> {
    const resultBlock: ResultMeta['block'] = {
      hash: block.hash ?? null,
      number: block.number ?? 0,
      timestamp: null
    };

    const syncStatus = await this.getSyncStatus();
    assert(syncStatus);

    if (block.hash) {
      const blockProgress = await this.getBlockProgress(block.hash);
      assert(blockProgress, 'No block with hash found');
      resultBlock.number = blockProgress.blockNumber;
      resultBlock.timestamp = blockProgress.blockTimestamp;
    } else {
      let blockHeight = block.number;

      if (!blockHeight) {
        blockHeight = syncStatus.latestProcessedBlockNumber;
      }

      // Get all the blocks at a height
      const [blockProgress] = await this.getBlocksAtHeight(blockHeight, false);

      if (blockProgress) {
        resultBlock.hash = blockProgress.blockHash;
        resultBlock.number = blockProgress.blockNumber;
        resultBlock.timestamp = blockProgress.blockTimestamp;
      }
    }

    return {
      block: resultBlock,
      hasIndexingErrors: syncStatus.hasIndexingError,
      deployment: ''
    };
  }

  async getSyncStatus (): Promise<SyncStatusInterface | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.getSyncStatus(dbTx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusIndexedBlock(dbTx, blockHash, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusChainHead(dbTx, blockHash, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusCanonicalBlock(dbTx, blockHash, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusProcessedBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusProcessedBlock(dbTx, blockHash, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusIndexingError (hasIndexingError: boolean): Promise<SyncStatusInterface | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusIndexingError(dbTx, hasIndexingError);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatus (syncStatus: DeepPartial<SyncStatusInterface>): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatus(dbTx, syncStatus);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getBlocks (blockFilter: { blockNumber?: number, blockHash?: string }): Promise<Array<EthFullBlock | null>> {
    assert(blockFilter.blockHash || blockFilter.blockNumber);
    const blocks = await this._ethClient.getFullBlocks(blockFilter);

    if (!blocks.length) {
      try {
        const blockHashOrNumber = blockFilter.blockHash || blockFilter.blockNumber as string | number;
        await this._ethProvider.getBlock(blockHashOrNumber);
      } catch (error: any) {
        // eth_getBlockByHash will update statediff but takes some time.
        // The block is not returned immediately and an error is thrown so that it is fetched in the next job retry.
        if (error.code !== ethers.utils.Logger.errors.SERVER_ERROR) {
          throw error;
        }

        log('Block not found. Fetching block after RPC call.');
      }
    }

    return blocks;
  }

  async getBlockByHash (blockHash?: string): Promise<{ block: any }> {
    return this._ethClient.getBlockByHash(blockHash);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined> {
    return this._db.getBlockProgress(blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgressInterface>, options: FindManyOptions<BlockProgressInterface>): Promise<BlockProgressInterface[]> {
    return this._db.getBlockProgressEntities(where, options);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]> {
    return this._db.getBlocksAtHeight(height, isPruned);
  }

  async markBlocksAsPruned (blocks: BlockProgressInterface[]): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.markBlocksAsPruned(dbTx, blocks);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async updateBlockProgress (block: BlockProgressInterface, lastProcessedEventIndex: number): Promise<BlockProgressInterface> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      const updatedBlock = await this._db.updateBlockProgress(dbTx, block, lastProcessedEventIndex);
      await dbTx.commitTransaction();

      return updatedBlock;
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async getEvent (id: string): Promise<EventInterface | undefined> {
    return this._db.getEvent(id);
  }

  async fetchAndSaveFilteredEventsAndBlocks (
    fromBlock: number,
    toBlock: number,
    eventSignaturesMap: Map<string, string[]>,
    parseEventNameAndArgs: (
      watchedContracts: ContractInterface[],
      logObj: { topics: string[]; data: string }
    ) => { eventParsed: boolean, eventDetails: any }
  ): Promise<{
    blockProgress: BlockProgressInterface,
    events: DeepPartial<EventInterface>[],
    ethFullBlock: EthFullBlock,
    ethFullTransactions: EthFullTransaction[]
  }[]> {
    assert(this._ethClient.getLogsForBlockRange, 'getLogsForBlockRange() not implemented in ethClient');

    const { addresses, topics } = this._createLogsFilters(eventSignaturesMap);

    const { logs } = await this._ethClient.getLogsForBlockRange({
      fromBlock,
      toBlock,
      addresses,
      topics
    });

    const blockLogsMap = this._reduceLogsToBlockLogsMap(logs);
    // Create unique list of tx required
    const txHashes = Array.from([
      ...new Set<string>(logs.map((log: any) => log.transaction.hash))
    ]);

    // Fetch blocks with transactions for the logs returned
    console.time(`time:indexer#fetchAndSaveFilteredEventsAndBlocks-fetch-blocks-txs-${fromBlock}-${toBlock}`);
    const blocksPromises = Array.from(blockLogsMap.keys()).map(async (blockHash) => {
      const [fullBlock] = await this._ethClient.getFullBlocks({ blockHash });
      assert(fullBlock);

      const block = {
        ...fullBlock,
        blockTimestamp: Number(fullBlock.timestamp),
        blockNumber: Number(fullBlock.blockNumber)
      };

      return {
        block: block as DeepPartial<BlockProgressInterface>,
        fullBlock
      };
    });

    const ethFullTxPromises = txHashes.map(async txHash => {
      return this._ethClient.getFullTransaction(txHash);
    });

    const blocks = await Promise.all(blocksPromises);
    const ethFullTxs = await Promise.all(ethFullTxPromises);

    const ethFullTxsMap = ethFullTxs.reduce((acc: Map<string, EthFullTransaction>, ethFullTx) => {
      acc.set(ethFullTx.ethTransactionCidByTxHash.txHash, ethFullTx);
      return acc;
    }, new Map());

    console.timeEnd(`time:indexer#fetchAndSaveFilteredEventsAndBlocks-fetch-blocks-txs-${fromBlock}-${toBlock}`);

    // Map db ready events according to blockhash
    console.time(`time:indexer#fetchAndSaveFilteredEventsAndBlocks-db-save-blocks-events-${fromBlock}-${toBlock}`);
    const blockWithDbEventsPromises = blocks.map(async ({ block, fullBlock }) => {
      const blockHash = block.blockHash;
      assert(blockHash);
      const logs = blockLogsMap.get(blockHash) || [];

      const txHashes = Array.from([
        ...new Set<string>(logs.map((log: any) => log.transaction.hash))
      ]);

      const blockEthFullTxs = txHashes.map(txHash => ethFullTxsMap.get(txHash)) as EthFullTransaction[];

      const events = this.createDbEventsFromLogsAndTxs(
        blockHash,
        logs,
        blockEthFullTxs.map(ethFullTx => ethFullTx?.ethTransactionCidByTxHash),
        parseEventNameAndArgs
      );
      const [blockProgress] = await this.saveBlockWithEvents(block, events);

      return {
        blockProgress,
        ethFullBlock: fullBlock,
        ethFullTransactions: blockEthFullTxs,
        block,
        events: []
      };
    });

    const blocksWithDbEvents = await Promise.all(blockWithDbEventsPromises);
    console.timeEnd(`time:indexer#fetchAndSaveFilteredEventsAndBlocks-db-save-blocks-events-${fromBlock}-${toBlock}`);

    return blocksWithDbEvents;
  }

  _reduceLogsToBlockLogsMap (logs: any[]): Map<string, any> {
    return logs.reduce((acc: Map<string, any>, log: any) => {
      const { blockHash: logBlockHash } = log;
      assert(typeof logBlockHash === 'string');

      if (!acc.has(logBlockHash)) {
        acc.set(logBlockHash, []);
      }

      acc.get(logBlockHash).push(log);
      return acc;
    }, new Map());
  }

  // Fetch events (to be saved to db) for a particular block
  async fetchEvents (
    blockHash: string, blockNumber: number,
    eventSignaturesMap: Map<string, string[]>,
    parseEventNameAndArgs: (watchedContracts: ContractInterface[], logObj: any) => { eventParsed: boolean, eventDetails: any }
  ): Promise<{ events: DeepPartial<EventInterface>[], transactions: EthFullTransaction[]}> {
    const { addresses, topics } = this._createLogsFilters(eventSignaturesMap);
    const { logs, transactions } = await this._fetchLogsAndTransactions(blockHash, blockNumber, addresses, topics);

    const events = this.createDbEventsFromLogsAndTxs(
      blockHash,
      logs,
      transactions.map(tx => tx.ethTransactionCidByTxHash),
      parseEventNameAndArgs
    );

    return { events, transactions };
  }

  async fetchEventsForContracts (
    blockHash: string, blockNumber: number,
    addresses: string[],
    eventSignaturesMap: Map<string, string[]>,
    parseEventNameAndArgs: (watchedContracts: ContractInterface[], logObj: any) => { eventParsed: boolean, eventDetails: any }
  ): Promise<DeepPartial<EventInterface>[]> {
    const { topics } = this._createLogsFilters(eventSignaturesMap);
    const { logs, transactions } = await this._fetchLogsAndTransactions(blockHash, blockNumber, addresses, topics);

    return this.createDbEventsFromLogsAndTxs(
      blockHash,
      logs,
      transactions.map(tx => tx.ethTransactionCidByTxHash),
      parseEventNameAndArgs
    );
  }

  async _fetchLogsAndTransactions (blockHash: string, blockNumber: number, addresses?: string[], topics?: string[][]): Promise<{ logs: any[]; transactions: EthFullTransaction[] }> {
    const { logs } = await this._ethClient.getLogs({
      blockHash,
      blockNumber: blockNumber.toString(),
      addresses,
      topics
    });

    const transactions = await this._fetchTxsFromLogs(logs);

    return { logs, transactions };
  }

  async _fetchTxsFromLogs (logs: any[]): Promise<EthFullTransaction[]> {
    const txHashList = Array.from([
      ...new Set<string>(logs.map((log) => log.transaction.hash))
    ]);

    return this.getFullTransactions(txHashList);
  }

  async getFullTransactions (txHashList: string[]): Promise<EthFullTransaction[]> {
    const ethFullTxPromises = txHashList.map(async txHash => {
      return this._ethClient.getFullTransaction(txHash);
    });

    return Promise.all(ethFullTxPromises);
  }

  // Create events to be saved to db for a block given blockHash, logs, transactions and a parser function
  createDbEventsFromLogsAndTxs (
    blockHash: string,
    logs: any, transactions: any,
    parseEventNameAndArgs: (watchedContracts: ContractInterface[], logObj: any) => { eventParsed: boolean, eventDetails: any }
  ): DeepPartial<EventInterface>[] {
    const transactionMap: {[key: string]: any} = transactions.reduce((acc: {[key: string]: any}, transaction: {[key: string]: any}) => {
      acc[transaction.txHash] = transaction;
      return acc;
    }, {});

    const dbEvents: Array<DeepPartial<EventInterface>> = [];

    // Check if upstream is FEVM and sort logs by tx and log index
    if (this._upstreamConfig.ethServer.isFEVM) {
      // Sort the logs array first by tx index
      // If two objects have the same tx index, it will then sort them by log index
      logs = logs.sort((a: any, b: any) => {
        if (a.transaction.hash !== b.transaction.hash) {
          return transactionMap[a.transaction.hash].index - transactionMap[b.transaction.hash].index;
        } else {
          return a.index - b.index;
        }
      });
    }

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
        const extraInfo: { [key: string]: any } = { tx, logIndex };

        const [topic0, topic1, topic2, topic3] = topics as string[];

        const contract = ethers.utils.getAddress(address);
        const watchedContracts = this.isContractAddressWatched(contract);

        if (watchedContracts) {
          const { eventParsed, eventDetails } = parseEventNameAndArgs(watchedContracts, logObj);
          if (!eventParsed) {
            // Skip unparsable events
            log(`WARNING: Skipping event for contract ${contract} as no matching event found in ABI`);
            continue;
          }

          eventName = eventDetails.eventName;
          eventInfo = eventDetails.eventInfo;
          extraInfo.eventSignature = eventDetails.eventSignature;
        }

        dbEvents.push({
          // Use loop index incase of FEVM as logIndex is not actual index of log in block
          index: this._upstreamConfig.ethServer.isFEVM ? li : logIndex,
          txHash,
          contract,
          eventName,
          topic0,
          topic1,
          topic2,
          topic3,
          data,
          eventInfo: JSONbigNative.stringify(eventInfo),
          extraInfo: JSONbigNative.stringify(extraInfo),
          proof: JSONbigNative.stringify({
            data: JSONbigNative.stringify({
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

    return dbEvents;
  }

  async saveBlockWithEvents (block: DeepPartial<BlockProgressInterface>, events: DeepPartial<EventInterface>[]): Promise<[BlockProgressInterface, DeepPartial<EventInterface>[]]> {
    const dbTx = await this._db.createTransactionRunner();
    try {
      console.time(`time:indexer#saveBlockWithEvents-db-save-${block.blockNumber}`);
      const blockProgress = await this._db.saveBlockWithEvents(dbTx, block, events);
      await dbTx.commitTransaction();
      console.timeEnd(`time:indexer#saveBlockWithEvents-db-save-${block.blockNumber}`);

      return [blockProgress, []];
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async saveBlockProgress (block: DeepPartial<BlockProgressInterface>): Promise<BlockProgressInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.saveBlockProgress(dbTx, block);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<EventInterface>> {
    return this._db.getBlockEvents(blockHash, where, queryOptions);
  }

  async getEventsByFilter (blockHash: string, contract?: string, name?: string): Promise<Array<EventInterface>> {
    // TODO: Uncomment after implementing hot reload of watched contracts in server process.
    // This doesn't affect functionality as we already have a filter condition on the contract in the query.
    // if (contract) {
    //   const watchedContract = await this.isWatchedContract(contract);
    //   if (!watchedContract) {
    //     throw new Error('Not a watched contract');
    //   }
    // }

    const where: Where = {
      eventName: [{
        value: UNKNOWN_EVENT_NAME,
        not: true,
        operator: 'equals'
      }]
    };

    if (contract) {
      where.contract = [
        { value: contract, operator: 'equals', not: false }
      ];
    }

    if (name) {
      where.eventName = [
        { value: name, operator: 'equals', not: false }
      ];
    }

    const events = await this._db.getBlockEvents(blockHash, where);
    log(`getEvents: db hit, num events: ${events.length}`);

    return events;
  }

  async removeUnknownEvents (eventEntityClass: new () => EventInterface, block: BlockProgressInterface): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.removeEntities(
        dbTx,
        eventEntityClass,
        {
          where: {
            block: { id: block.id },
            eventName: UNKNOWN_EVENT_NAME
          },
          relations: ['block']
        }
      );

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async getAncestorAtHeight (blockHash: string, height: number): Promise<string> {
    return this._db.getAncestorAtHeight(blockHash, height);
  }

  async saveEventEntity (dbEvent: EventInterface): Promise<EventInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.saveEventEntity(dbTx, dbEvent);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async saveEvents (dbEvents: DeepPartial<EventInterface>[]): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.saveEvents(dbTx, dbEvents);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._db.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number, maxBlockRange: number = DEFAULT_MAX_EVENTS_BLOCK_RANGE): Promise<Array<EventInterface>> {
    if (toBlockNumber <= fromBlockNumber) {
      throw new Error('toBlockNumber should be greater than fromBlockNumber');
    }

    if (maxBlockRange > -1 && (toBlockNumber - fromBlockNumber) > maxBlockRange) {
      throw new Error(`Max range (${maxBlockRange}) exceeded`);
    }

    return this._db.getEventsInRange(fromBlockNumber, toBlockNumber);
  }

  isContractAddressWatched (address : string): ContractInterface[] | undefined {
    return this._watchedContractsByAddressMap[address];
  }

  getContractsByKind (kind: string): ContractInterface[] {
    const watchedContracts = Object.values(this._watchedContractsByAddressMap)
      .reduce(
        (acc, contracts) => acc.concat(contracts.filter(contract => contract.kind === kind)),
        []
      );

    return watchedContracts;
  }

  getWatchedContracts (): ContractInterface[] {
    return Object.values(this._watchedContractsByAddressMap).flat();
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number, context?: any): Promise<void> {
    assert(this._db.saveContract);

    // Use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress) if input to address is a contract address.
    // If a contract identifier is passed as address instead, no need to convert to checksum address.
    // Customize: use the kind input to filter out non-contract-address input to address.
    const contractAddress = (kind === '__protocol__') ? address : ethers.utils.getAddress(address);

    this.updateStateStatusMap(contractAddress, {});
    const dbTx = await this._db.createTransactionRunner();

    try {
      const contract = await this._db.saveContract(dbTx, contractAddress, kind, checkpoint, startingBlock, context);
      this.cacheContract(contract);
      await dbTx.commitTransaction();

      const contractJob: ContractJobData = { kind: EventsQueueJobKind.CONTRACT, contract };
      await this._jobQueue.pushJob(
        QUEUE_EVENT_PROCESSING,
        contractJob,
        { priority: 1 }
      );
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async removeContract (address: string, kind: string): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.deleteEntitiesByConditions(dbTx, 'contract', { kind, address });
      this._clearWatchedContracts(
        watchedContract => watchedContract.kind === kind && watchedContract.address === address
      );
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  cacheContract (contract: ContractInterface): void {
    if (!this._watchedContractsByAddressMap[contract.address]) {
      this._watchedContractsByAddressMap[contract.address] = [];
    }

    // Check if contract with kind is already cached and skip
    const isAlreadyCached = this._watchedContractsByAddressMap[contract.address]
      .some(watchedContract => contract.id === watchedContract.id);

    if (isAlreadyCached) {
      return;
    }

    this._watchedContractsByAddressMap[contract.address].push(contract);
  }

  async getStorageValue (storageLayout: StorageLayout, blockHash: string, token: string, variable: string, ...mappingKeys: any[]): Promise<ValueResult> {
    return getStorageValue(
      storageLayout,
      this._getStorageAt,
      blockHash,
      token,
      variable,
      ...mappingKeys
    );
  }

  getStateData (state: StateInterface): any {
    return codec.decode(Buffer.from(state.data));
  }

  async getLatestStateIndexedBlock (): Promise<BlockProgressInterface> {
    // Get current stateSyncStatus.
    const stateSyncStatus = await this._db.getStateSyncStatus();
    assert(stateSyncStatus, 'stateSyncStatus not found');

    // Get all the blocks at height stateSyncStatus.latestIndexedBlockNumber.
    const blocksAtHeight = await this.getBlocksAtHeight(stateSyncStatus.latestIndexedBlockNumber, false);

    // There can exactly one block at stateSyncStatus.latestIndexedBlockNumber height.
    assert(blocksAtHeight.length === 1);

    return blocksAtHeight[0];
  }

  async processCheckpoint (indexer: IndexerInterface, blockHash: string, checkpointInterval: number): Promise<void> {
    if (!this._serverConfig.enableState) {
      return;
    }

    // Get all the contracts.
    const [contracts] = Object.values(this._watchedContractsByAddressMap);

    // Getting the block for checkpoint.
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // For each contract, merge the diff till now to create a checkpoint.
    for (const contract of contracts) {
      // Get State status for the contract.
      const stateStatus = this._stateStatusMap[contract.address];
      assert(stateStatus, `State status for contract ${contract.address} not found`);

      const initBlockNumber = stateStatus.init;

      // Check if contract has checkpointing on.
      // Check if it's time for a checkpoint or the init is in current block.
      if (
        contract.checkpoint &&
        (block.blockNumber % checkpointInterval === 0 || initBlockNumber === block.blockNumber)
      ) {
        await this.createCheckpoint(indexer, contract.address, block);
      }
    }
  }

  async processCLICheckpoint (indexer: IndexerInterface, contractAddress: string, blockHash?: string): Promise<string | undefined> {
    if (!this._serverConfig.enableState) {
      return;
    }

    // Getting the block for checkpoint.
    let block;

    if (blockHash) {
      block = await this.getBlockProgress(blockHash);
    } else {
      // In case of empty blockHash from checkpoint CLI, get the latest indexed block from stateSyncStatus for the checkpoint.
      block = await this.getLatestStateIndexedBlock();
    }

    assert(block);

    const checkpointBlockHash = await this.createCheckpoint(indexer, contractAddress, block);
    assert(checkpointBlockHash, 'Checkpoint not created');

    return checkpointBlockHash;
  }

  async createStateCheckpoint (contractAddress: string, block: BlockProgressInterface, data: any): Promise<void> {
    if (!this._serverConfig.enableState) {
      return;
    }

    // Get the contract.
    const watchedContracts = this._watchedContractsByAddressMap[contractAddress];
    assert(watchedContracts, `Contract ${contractAddress} not watched`);
    const [firstWatchedContract] = watchedContracts.sort((a, b) => a.startingBlock - b.startingBlock);

    if (block.blockNumber < firstWatchedContract.startingBlock) {
      return;
    }

    // Create a checkpoint from the hook data without being concerned about diffs.
    const state = await this.prepareStateEntry(block, contractAddress, data, StateKind.Checkpoint);
    await this.saveOrUpdateState(state);
  }

  async createInit (
    indexer: IndexerInterface,
    blockHash: string,
    blockNumber: number
  ): Promise<void> {
    if (!this._serverConfig.enableState) {
      return;
    }

    // Get all the contracts.
    const watchedContractsByAddress = Object.values(this._watchedContractsByAddressMap);

    // Create an initial state for each contract.
    for (const watchedContracts of watchedContractsByAddress) {
      // Get the first watched contract
      const [contract] = watchedContracts.sort((a, b) => a.startingBlock - b.startingBlock);

      // Check if contract has checkpointing on.
      if (contract.checkpoint) {
        // Check if starting block not reached yet.
        if (blockNumber < contract.startingBlock) {
          continue;
        }

        // Get State status for the contract.
        const stateStatus = this._stateStatusMap[contract.address];
        assert(stateStatus, `State status for contract ${contract.address} not found`);

        // Check if a 'init' State already exists.
        // Or if a 'diff' State already exists.
        // Or if a 'checkpoint' State already exists.
        // (A watcher with imported state won't have an init State, but it will have the imported checkpoint)
        if (
          stateStatus.init ||
          stateStatus.diff ||
          stateStatus.checkpoint
        ) {
          continue;
        }

        // Call initial state hook.
        const stateData = await indexer.processInitialState(contract.address, blockHash);

        const block = await this.getBlockProgress(blockHash);
        assert(block);

        const state = await this.prepareStateEntry(block, contract.address, stateData, StateKind.Init);
        await this.saveOrUpdateState(state);
      }
    }
  }

  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    if (!this._serverConfig.enableState) {
      return;
    }

    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // Get the contract.
    const watchedContracts = this._watchedContractsByAddressMap[contractAddress];
    assert(watchedContracts, `Contract ${contractAddress} not watched`);
    const [contract] = watchedContracts.sort((a, b) => a.startingBlock - b.startingBlock);

    if (block.blockNumber < contract.startingBlock) {
      return;
    }

    // Create a staged diff state.
    const state = await this.prepareStateEntry(block, contractAddress, data, StateKind.DiffStaged);
    await this.saveOrUpdateState(state);
  }

  async finalizeDiffStaged (blockHash: string): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // Get all the staged diff states for the given blockHash.
    const stagedStates = await this._db.getStates({ block, kind: StateKind.DiffStaged });

    // For each staged block, create a diff block.
    for (const stagedState of stagedStates) {
      const data = codec.decode(Buffer.from(stagedState.data));
      await this.createDiff(stagedState.contractAddress, block, data);
    }

    // Remove all the staged diff states for current blockNumber.
    // (Including staged diff blocks associated with pruned blocks)
    await this.removeStates(block.blockNumber, StateKind.DiffStaged);
  }

  async createDiff (contractAddress: string, block: BlockProgressInterface, data: any): Promise<void> {
    if (!this._serverConfig.enableState) {
      return;
    }

    // Get the contract.
    const watchedContracts = this._watchedContractsByAddressMap[contractAddress];
    assert(watchedContracts, `Contract ${contractAddress} not watched`);
    const [contract] = watchedContracts.sort((a, b) => a.startingBlock - b.startingBlock);

    if (block.blockNumber < contract.startingBlock) {
      return;
    }

    // Get State status for the contract.
    const stateStatus = this._stateStatusMap[contractAddress];
    assert(stateStatus, `State status for contract ${contractAddress} not found`);

    // Get the latest checkpoint block number.
    const checkpointBlockNumber = stateStatus.checkpoint;

    if (!checkpointBlockNumber) {
      // Get the initial state block number.
      const initBlockNumber = stateStatus.init;

      // There should be an initial state at least.
      assert(initBlockNumber, `No initial state found for contract ${contractAddress}`);
    } else if (checkpointBlockNumber === block.blockNumber) {
      // Check if the latest checkpoint is in the same block if block number is same.
      const checkpoint = await this._db.getLatestState(contractAddress, StateKind.Checkpoint);
      assert(checkpoint);

      assert(checkpoint.block.blockHash !== block.blockHash, 'Checkpoint already created for the block hash');
    }

    const state = await this.prepareStateEntry(block, contractAddress, data, StateKind.Diff);
    await this.saveOrUpdateState(state);
  }

  async createCheckpoint (indexer: IndexerInterface, contractAddress: string, currentBlock: BlockProgressInterface): Promise<string | undefined> {
    if (!this._serverConfig.enableState) {
      return;
    }

    // Get the contract.
    const watchedContracts = this._watchedContractsByAddressMap[contractAddress];
    assert(watchedContracts, `Contract ${contractAddress} not watched`);
    const [contract] = watchedContracts.sort((a, b) => a.startingBlock - b.startingBlock);

    if (currentBlock.blockNumber < contract.startingBlock) {
      return;
    }

    // Make sure the block is marked complete.
    assert(currentBlock.isComplete, 'Block for a checkpoint should be marked as complete');

    // Get current stateSyncStatus.
    const stateSyncStatus = await this._db.getStateSyncStatus();
    assert(stateSyncStatus);

    // Make sure state for the block has been indexed.
    assert(currentBlock.blockNumber <= stateSyncStatus.latestIndexedBlockNumber, 'State should be indexed for checkpoint at a block');

    // Call state checkpoint hook and check if default checkpoint is disabled.
    const disableDefaultCheckpoint = await indexer.processStateCheckpoint(contractAddress, currentBlock.blockHash);

    if (disableDefaultCheckpoint) {
      // Return if default checkpoint is disabled.
      // Return block hash for checkpoint CLI.
      return currentBlock.blockHash;
    }

    // Fetch the latest 'checkpoint' | 'init' for the contract to fetch diffs after it.
    let prevNonDiffState: StateInterface;
    let diffStartBlockNumber: number;
    const checkpointState = await this._db.getLatestState(contractAddress, StateKind.Checkpoint, currentBlock.blockNumber - 1);

    if (checkpointState) {
      const checkpointBlockNumber = checkpointState.block.blockNumber;

      prevNonDiffState = checkpointState;
      diffStartBlockNumber = checkpointBlockNumber;

      // Update State status map with the latest checkpoint info.
      // Essential while importing state as checkpoint at the snapshot block is added by import-state CLI.
      // (job-runner won't have the updated State status)
      this.updateStateStatusMap(contractAddress, { checkpoint: checkpointBlockNumber });
    } else {
      // There should be an initial state at least.
      const initBlock = await this._db.getLatestState(contractAddress, StateKind.Init);
      assert(initBlock, `No initial state found for contract ${contractAddress}`);

      prevNonDiffState = initBlock;
      // Take block number previous to initial state block as the checkpoint is to be created in the same block.
      diffStartBlockNumber = initBlock.block.blockNumber - 1;
    }

    const prevNonDiffStateData = codec.decode(Buffer.from(prevNonDiffState.data)) as any;
    let data = {
      state: prevNonDiffStateData.state
    };

    console.time(`time:indexer#createCheckpoint-${contractAddress}`);

    // Fetching and merging all diff blocks after the latest 'checkpoint' | 'init'.
    data = await this._mergeDiffsInRange(data, contractAddress, diffStartBlockNumber, currentBlock.blockNumber);

    const state = await this.prepareStateEntry(currentBlock, contractAddress, data, StateKind.Checkpoint);
    await this.saveOrUpdateState(state);

    console.timeEnd(`time:indexer#createCheckpoint-${contractAddress}`);
    return currentBlock.blockHash;
  }

  async prepareStateEntry (block: BlockProgressInterface, contractAddress: string, data: any, kind: StateKind):Promise<any> {
    console.time('time:indexer#prepareStateEntry');
    let stateEntry: StateInterface;

    // Get State status for the contract.
    const stateStatus = this._stateStatusMap[contractAddress];
    assert(stateStatus, `State status for contract ${contractAddress} not found`);

    // Get an existing 'init' | 'diff' | 'diff_staged' | 'checkpoint' State for current block, contractAddress to update.
    let currentState: StateInterface | undefined;
    const prevStateBlockNumber = stateStatus[kind];

    // Fetch previous State from DB if:
    // present at the same height (to update)
    // or for checkpoint kind (to build upon previous checkpoint)
    if (kind === 'checkpoint' || (prevStateBlockNumber && prevStateBlockNumber === block.blockNumber)) {
      const currentStates = await this._db.getStates({ block, contractAddress, kind });

      // There can be at most one State for a (block, contractAddress, kind) combination.
      assert(currentStates.length <= 1);
      currentState = currentStates[0];
    }

    let stateDataMeta: StateDataMeta | undefined;

    if (currentState) {
      // Update current State of same kind if it exists.
      stateEntry = currentState;

      // Update the data field.
      const oldData = codec.decode(Buffer.from(stateEntry.data));
      data = _.merge(oldData, data);
    } else {
      // Create a new State instance.
      stateEntry = this._db.getNewState();

      // Fetch the parent State entry.
      const parentState = await this._db.getLatestState(contractAddress, null, block.blockNumber);

      // Setting the meta-data for a State entry (done only once per State entry).
      stateDataMeta = {
        id: contractAddress,
        kind,
        parent: {
          '/': parentState ? parentState.cid : null
        },
        ethBlock: {
          cid: {
            '/': block.cid
          },
          num: block.blockNumber
        }
      };
    }

    const { cid, data: { meta }, bytes } = await createOrUpdateStateData(
      data,
      stateDataMeta
    );

    assert(meta);

    // Update stateEntry with new data.
    stateEntry = Object.assign(stateEntry, {
      block,
      contractAddress,
      cid: cid.toString(),
      kind: meta.kind,
      data: Buffer.from(bytes)
    });

    console.timeEnd('time:indexer#prepareStateEntry');
    return stateEntry;
  }

  async getStatesByHash (blockHash: string): Promise<StateInterface[]> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._db.getStates({ block });
  }

  async getStateByCID (cid: string): Promise<StateInterface | undefined> {
    const ipldBlocks = await this._db.getStates({ cid });

    // There can be only one IPLDBlock with a particular cid.
    assert(ipldBlocks.length <= 1);

    return ipldBlocks[0];
  }

  async saveOrUpdateState (state: StateInterface): Promise<StateInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.saveOrUpdateState(dbTx, state);

      // Get State status for the contract.
      const stateStatus = this._stateStatusMap[res.contractAddress];
      assert(stateStatus, `State status for contract ${res.contractAddress} not found`);

      // Update the State status for the kind.
      stateStatus[res.kind] = res.block.blockNumber;

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async removeStates (blockNumber: number, kind: StateKind): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._db.removeStates(dbTx, blockNumber, kind);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async fetchStateStatus (): Promise<void> {
    if (!this._serverConfig.enableState) {
      return;
    }

    const contractAddresses = Object.keys(this._watchedContractsByAddressMap);

    // TODO: Fire a single query for all contracts.
    for (const contractAddress of contractAddresses) {
      const initState = await this._db.getLatestState(contractAddress, StateKind.Init);
      const diffState = await this._db.getLatestState(contractAddress, StateKind.Diff);
      const diffStagedState = await this._db.getLatestState(contractAddress, StateKind.DiffStaged);
      const checkpointState = await this._db.getLatestState(contractAddress, StateKind.Checkpoint);

      this._stateStatusMap[contractAddress] = {
        init: initState?.block.blockNumber,
        diff: diffState?.block.blockNumber,
        diff_staged: diffStagedState?.block.blockNumber,
        checkpoint: checkpointState?.block.blockNumber
      };
    }
  }

  async resetWatcherToBlock (blockNumber: number, entities: EntityTarget<{ blockNumber: number }>[]): Promise<void> {
    const blockProgresses = await this.getBlocksAtHeight(blockNumber, false);
    assert(blockProgresses.length, `No blocks at specified block number ${blockNumber}`);
    assert(!blockProgresses.some(block => !block.isComplete), `Incomplete block at block number ${blockNumber} with unprocessed events`);
    const [blockProgress] = blockProgresses;
    const dbTx = await this._db.createTransactionRunner();

    try {
      for (const entity of entities) {
        await this._db.deleteEntitiesByConditions(dbTx, entity, { blockNumber: MoreThan(blockNumber) });
      }

      await this._db.deleteEntitiesByConditions(dbTx, 'contract', { startingBlock: MoreThan(blockNumber) });
      this._clearWatchedContracts((watchedContract) => watchedContract.startingBlock > blockNumber);

      await this._db.deleteEntitiesByConditions(dbTx, 'block_progress', { blockNumber: MoreThan(blockNumber) });

      const syncStatus = await this.getSyncStatus();
      assert(syncStatus, 'Missing syncStatus');

      if (syncStatus.latestIndexedBlockNumber > blockProgress.blockNumber) {
        await this.updateSyncStatusIndexedBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
      }

      if (syncStatus.latestProcessedBlockNumber > blockProgress.blockNumber) {
        await this.updateSyncStatusProcessedBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
      }

      if (syncStatus.latestCanonicalBlockNumber > blockProgress.blockNumber) {
        await this.updateSyncStatusCanonicalBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
      }

      const stateSyncStatus = await this._db.getStateSyncStatus();

      if (stateSyncStatus) {
        if (stateSyncStatus.latestIndexedBlockNumber > blockProgress.blockNumber) {
          await this._db.updateStateSyncStatusIndexedBlock(dbTx, blockNumber, true);
        }

        if (stateSyncStatus.latestCheckpointBlockNumber > blockProgress.blockNumber) {
          await this._db.updateStateSyncStatusCheckpointBlock(dbTx, blockNumber, true);
        }
      }

      await this.updateSyncStatusChainHead(blockProgress.blockHash, blockProgress.blockNumber, true);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async clearProcessedBlockData (block: BlockProgressInterface, entities: EntityTarget<{ blockHash: string }>[]): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      for (const entity of entities) {
        await this._db.deleteEntitiesByConditions(dbTx, entity, { blockHash: Equal(block.blockHash) });
      }

      await this._db.deleteEntitiesByConditions(dbTx, 'contract', { startingBlock: Equal(block.blockNumber) });
      this._clearWatchedContracts((watchedContracts) => watchedContracts.startingBlock === block.blockNumber);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  _clearWatchedContracts (removeFilter: (watchedContract: ContractInterface) => boolean): void {
    this._watchedContractsByAddressMap = Object.entries(this._watchedContractsByAddressMap)
      .map(([address, watchedContracts]): [string, ContractInterface[]] => [
        address,
        watchedContracts.filter(watchedContract => !removeFilter(watchedContract))
      ])
      .filter(([, watchedContracts]) => watchedContracts.length)
      .reduce((acc: {[key: string]: ContractInterface[]}, [address, watchedContracts]) => {
        acc[address] = watchedContracts;

        return acc;
      }, {});
  }

  updateStateStatusMap (address: string, stateStatus: StateStatus): void {
    // Get and update State status for the contract.
    const oldStateStatus = this._stateStatusMap[address];
    this._stateStatusMap[address] = _.merge(oldStateStatus, stateStatus);
  }

  _createLogsFilters (eventSignaturesMap: Map<string, string[]>): { addresses: string[] | undefined, topics: string[][] | undefined } {
    let addresses: string[] | undefined;
    let eventSignatures: string[] | undefined;

    if (this._upstreamConfig.ethServer.filterLogsByAddresses) {
      const watchedContracts = this.getWatchedContracts();
      addresses = watchedContracts.map((watchedContract): string => {
        return watchedContract.address;
      });
    }

    if (this._upstreamConfig.ethServer.filterLogsByTopics) {
      const eventSignaturesSet = new Set<string>();
      eventSignaturesMap.forEach(sigs => sigs.forEach(sig => {
        eventSignaturesSet.add(sig);
      }));

      eventSignatures = Array.from(eventSignaturesSet);
    }

    return { addresses, topics: eventSignatures && [eventSignatures] };
  }

  parseEvent (logDescription: ethers.utils.LogDescription): { eventName: string, eventInfo: {[key: string]: any}, eventSignature: string } {
    const eventInfo = logDescription.eventFragment.inputs.reduce((acc: {[key: string]: any}, input, index) => {
      acc[input.name] = this._parseLogArg(input, logDescription.args[index]);

      return acc;
    }, {});

    return {
      eventName: logDescription.name,
      eventInfo,
      eventSignature: logDescription.signature
    };
  }

  _parseLogArg (param: ethers.utils.ParamType, arg: ethers.utils.Result): any {
    if (ethers.utils.Indexed.isIndexed(arg)) {
      // Get hash if indexed reference type.
      return arg.hash;
    }

    if (ethers.BigNumber.isBigNumber(arg)) {
      return arg.toBigInt();
    }

    if (param.baseType === 'array') {
      return arg.map(el => this._parseLogArg(param.arrayChildren, el));
    }

    if (param.baseType === 'tuple') {
      return param.components.reduce((acc: any, component) => {
        acc[component.name] = this._parseLogArg(component, arg[component.name]);
        return acc;
      }, {});
    }

    return arg;
  }

  async _mergeDiffsInRange (data: { state: any }, contractAddress: string, startBlock: number, endBlock: number): Promise<{ state: any }> {
    // Merge all diff blocks in the given range in batches.
    for (let i = startBlock; i < endBlock;) {
      const endBlockHeight = Math.min(i + DIFF_MERGE_BATCH_SIZE, endBlock);

      console.time(`time:indexer#_mergeDiffsInRange-${i}-${endBlockHeight}-${contractAddress}`);
      const diffBlocks = await this._db.getDiffStatesInRange(contractAddress, i, endBlockHeight);

      // Merge all diff blocks in the current batch.
      for (const diffBlock of diffBlocks) {
        const diff = codec.decode(Buffer.from(diffBlock.data)) as any;
        data.state = _.merge(data.state, diff.state);
      }

      console.timeEnd(`time:indexer#_mergeDiffsInRange-${i}-${endBlockHeight}-${contractAddress}`);
      i = endBlockHeight;
    }

    return data;
  }
}
