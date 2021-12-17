//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import debug from 'debug';
import { ethers } from 'ethers';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { GetStorageAt, getStorageValue, StorageLayout } from '@vulcanize/solidity-mapper';

import { BlockProgressInterface, DatabaseInterface, EventInterface, SyncStatusInterface, ContractInterface } from './types';
import { UNKNOWN_EVENT_NAME, JOB_KIND_CONTRACT, QUEUE_EVENT_PROCESSING } from './constants';
import { JobQueue } from './job-queue';
import { Where, QueryOptions } from './database';

const MAX_EVENTS_BLOCK_RANGE = 1000;

const log = debug('vulcanize:indexer');

export interface ValueResult {
  value: any;
  proof?: {
    data: string;
  }
}

export class Indexer {
  _db: DatabaseInterface;
  _ethClient: EthClient;
  _postgraphileClient: EthClient;
  _getStorageAt: GetStorageAt;
  _ethProvider: ethers.providers.BaseProvider;
  _jobQueue: JobQueue;

  _watchedContracts: { [key: string]: ContractInterface } = {};

  constructor (db: DatabaseInterface, ethClient: EthClient, postgraphileClient: EthClient, ethProvider: ethers.providers.BaseProvider, jobQueue: JobQueue) {
    this._db = db;
    this._ethClient = ethClient;
    this._postgraphileClient = postgraphileClient;
    this._ethProvider = ethProvider;
    this._jobQueue = jobQueue;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);
  }

  async fetchContracts (): Promise<void> {
    assert(this._db.getContracts);

    const contracts = await this._db.getContracts();

    this._watchedContracts = contracts.reduce((acc: { [key: string]: ContractInterface }, contract) => {
      acc[contract.address] = contract;

      return acc;
    }, {});
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

  async getBlocks (blockFilter: { blockNumber?: number, blockHash?: string }): Promise<any> {
    assert(blockFilter.blockHash || blockFilter.blockNumber);
    const result = await this._postgraphileClient.getBlocks(blockFilter);
    const { allEthHeaderCids: { nodes: blocks } } = result;

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

  async fetchBlockEvents (block: DeepPartial<BlockProgressInterface>, fetchAndSaveEvents: (block: DeepPartial<BlockProgressInterface>) => Promise<BlockProgressInterface>): Promise<BlockProgressInterface> {
    assert(block.blockHash);

    log(`getBlockEvents: fetching from upstream server ${block.blockHash}`);
    const blockProgress = await fetchAndSaveEvents(block);
    log(`getBlockEvents: fetched for block: ${blockProgress.blockHash} num events: ${blockProgress.numEvents}`);

    return blockProgress;
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<EventInterface>> {
    return this._db.getBlockEvents(blockHash, where, queryOptions);
  }

  async getEventsByFilter (blockHash: string, contract: string, name: string | null): Promise<Array<EventInterface>> {
    if (contract) {
      const watchedContract = await this.isWatchedContract(contract);
      if (!watchedContract) {
        throw new Error('Not a watched contract');
      }
    }

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

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._db.getAncestorAtDepth(blockHash, depth);
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

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._db.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<EventInterface>> {
    if (toBlockNumber <= fromBlockNumber) {
      throw new Error('toBlockNumber should be greater than fromBlockNumber');
    }

    if ((toBlockNumber - fromBlockNumber) > MAX_EVENTS_BLOCK_RANGE) {
      throw new Error(`Max range (${MAX_EVENTS_BLOCK_RANGE}) exceeded`);
    }

    return this._db.getEventsInRange(fromBlockNumber, toBlockNumber);
  }

  async isWatchedContract (address : string): Promise<ContractInterface | undefined> {
    return this._watchedContracts[address];
  }

  async watchContract (address: string, kind: string, startingBlock: number): Promise<void> {
    assert(this._db.saveContract);
    const dbTx = await this._db.createTransactionRunner();

    // Always use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress).
    const contractAddress = ethers.utils.getAddress(address);

    try {
      const contract = await this._db.saveContract(dbTx, contractAddress, kind, startingBlock);
      this.cacheContract(contract);
      await dbTx.commitTransaction();

      await this._jobQueue.pushJob(
        QUEUE_EVENT_PROCESSING,
        {
          kind: JOB_KIND_CONTRACT,
          contract
        },
        { priority: 1 }
      );
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  cacheContract (contract: ContractInterface): void {
    this._watchedContracts[contract.address] = contract;
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
}
