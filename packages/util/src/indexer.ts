//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';

import { BlockProgressInterface, DatabaseInterface, SyncStatusInterface } from './types';

export class Indexer {
  _db: DatabaseInterface;

  constructor (db: DatabaseInterface) {
    this._db = db;
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusIndexedBlock(dbTx, blockHash, blockNumber);
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

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusCanonicalBlock(dbTx, blockHash, blockNumber);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]> {
    return this._db.getBlocksAtHeight(height, isPruned);
  }

  async blockIsAncestor (ancestorBlockHash: string, blockHash: string, maxDepth: number): Promise<boolean> {
    assert(maxDepth > 0);

    let depth = 0;
    let currentBlockHash = blockHash;
    let currentBlock;

    // TODO: Use a hierarchical query to optimize this.
    while (depth < maxDepth) {
      depth++;

      currentBlock = await this._db.getBlockProgress(currentBlockHash);
      if (!currentBlock) {
        break;
      } else {
        if (currentBlock.parentHash === ancestorBlockHash) {
          return true;
        }

        // Descend the chain.
        currentBlockHash = currentBlock.parentHash;
      }
    }

    return false;
  }

  async markBlockAsPruned (block: BlockProgressInterface): Promise<BlockProgressInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.markBlockAsPruned(dbTx, block);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }
}
