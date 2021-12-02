//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { DeepPartial, FindConditions, Not } from 'typeorm';
import debug from 'debug';
import { ethers } from 'ethers';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { GetStorageAt, getStorageValue, StorageLayout } from '@vulcanize/solidity-mapper';

import { BlockProgressInterface, DatabaseInterface, EventInterface, SyncStatusInterface, ContractInterface } from './types';
import { UNKNOWN_EVENT_NAME } from './constants';

const MAX_EVENTS_BLOCK_RANGE = 1000;
const MISSING_BLOCKS_ERROR = 'sql: no rows in result set';

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
  _getStorageAt: GetStorageAt;
  _ethProvider: ethers.providers.BaseProvider;

  constructor (db: DatabaseInterface, ethClient: EthClient, ethProvider: ethers.providers.BaseProvider) {
    this._db = db;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);
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

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusChainHead(dbTx, blockHash, blockNumber);
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

  async getBlock (blockHash: string): Promise<any> {
    try {
      const { block } = await this._ethClient.getBlockByHash(blockHash);

      return block;
    } catch (error) {
      // If block is not present in header_cids, eth_getBlockByHash call is made to update statediff.
      if (error instanceof Error && error.message === MISSING_BLOCKS_ERROR) {
        try {
          await this._ethProvider.getBlock(blockHash);
        } catch (error: any) {
          // eth_getBlockByHash will update statediff but takes some time.
          // The block is not returned immediately and an error is thrown so that it is fetched in the next job retry.
          if (error.code === ethers.utils.Logger.errors.SERVER_ERROR) {
            throw new Error('Block not found');
          }

          throw error;
        }
      }

      throw error;
    }
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined> {
    return this._db.getBlockProgress(blockHash);
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

  async updateBlockProgress (blockHash: string, lastProcessedEventIndex: number): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateBlockProgress(dbTx, blockHash, lastProcessedEventIndex);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getEvent (id: string): Promise<EventInterface | undefined> {
    return this._db.getEvent(id);
  }

  async getOrFetchBlockEvents (block: DeepPartial<BlockProgressInterface>, fetchAndSaveEvents: (block: DeepPartial<BlockProgressInterface>) => Promise<void>): Promise<Array<EventInterface>> {
    assert(block.blockHash);
    const blockProgress = await this._db.getBlockProgress(block.blockHash);
    if (!blockProgress) {
      // Fetch and save events first and make a note in the event sync progress table.
      log(`getBlockEvents: db miss, fetching from upstream server ${block.blockHash}`);
      await fetchAndSaveEvents(block);
    }

    const events = await this._db.getBlockEvents(block.blockHash);
    log(`getBlockEvents: db hit, ${block.blockHash} num events: ${events.length}`);

    return events;
  }

  async getBlockEvents (blockHash: string): Promise<Array<EventInterface>> {
    return this._db.getBlockEvents(blockHash);
  }

  async getEventsByFilter (blockHash: string, contract: string, name: string | null): Promise<Array<EventInterface>> {
    if (contract) {
      const watchedContract = await this.isWatchedContract(contract);
      if (!watchedContract) {
        throw new Error('Not a watched contract');
      }
    }

    const where: FindConditions<EventInterface> = {
      eventName: Not(UNKNOWN_EVENT_NAME)
    };

    if (contract) {
      where.contract = contract;
    }

    if (name) {
      where.eventName = name;
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
    assert(this._db.getContract);

    return this._db.getContract(ethers.utils.getAddress(address));
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
