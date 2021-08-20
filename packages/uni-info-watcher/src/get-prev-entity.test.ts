//
// Copyright 2021 Vulcanize, Inc.
//

import { expect, assert } from 'chai';
import 'mocha';
import _ from 'lodash';

import {
  getConfig
} from '@vulcanize/util';
import { removeEntities } from '@vulcanize/util/test';

import { Database } from './database';
import { createTestBlockTree, insertDummyToken } from '../test/utils';
import { Block } from './events';
import { BlockProgress } from './entity/BlockProgress';
import { SyncStatus } from './entity/SyncStatus';
import { Token } from './entity/Token';

describe('getPrevEntityVersion', () => {
  let db: Database;
  let blocks: Block[][];
  let tail: Block;
  let head: Block;
  let isDbEmptyBeforeTest: boolean;

  before(async () => {
    // Get config.
    const configFile = './environments/local.toml';
    const config = await getConfig(configFile);

    const { database: dbConfig } = config;
    assert(dbConfig, 'Missing dbConfig.');

    // Initialize database.
    db = new Database(dbConfig);
    await db.init();

    // Check if database is empty.
    const isBlockProgressEmpty = await db.isEntityEmpty(BlockProgress);
    const isTokenEmpty = await db.isEntityEmpty(Token);
    const isSyncStatusEmpty = await db.isEntityEmpty(SyncStatus);
    isDbEmptyBeforeTest = isBlockProgressEmpty && isTokenEmpty && isSyncStatusEmpty;

    assert(isDbEmptyBeforeTest, 'Abort: Database not empty.');

    // Create BlockProgress test data.
    blocks = await createTestBlockTree(db);
    tail = blocks[0][0];
    head = blocks[3][10];
  });

  after(async () => {
    if (isDbEmptyBeforeTest) {
      await removeEntities(db, BlockProgress);
      await removeEntities(db, SyncStatus);
    }
    await db.close();
  });

  afterEach(async () => {
    await removeEntities(db, Token);
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //                                     | 20|            | 15|------Token (token44)
  //                                     +---+            +---+
  //                                       |             /
  //                                       |            /
  //                                      8 Blocks   3 Blocks
  //                                       |          /
  //                                       |         /
  //                       +---+         +---+  +---+
  //                       | 11|         | 11|  | 11|
  //                       +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                   7 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |------Token (token00)
  //                                     +---+        (Target)
  //
  it('should fetch Token in pruned region', async () => {
    // Insert a Token entity at the tail.
    const token00 = await insertDummyToken(db, tail);

    const token44 = _.cloneDeep(token00);
    token44.txCount++;
    await insertDummyToken(db, blocks[4][4], token44);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: token00.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(token00.id);
      expect(searchedToken?.txCount).to.be.equal(token00.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(token00.blockNumber);
      expect(searchedToken?.blockHash).to.be.equal(token00.blockHash);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //                                     | 20|            | 15|------Token (token44)
  //                                     +---+            +---+
  //                                       |             /
  //                                       |            /
  //                                      8 Blocks   3 Blocks
  //                                       |          /
  //                                       |         /
  //                       +---+         +---+  +---+
  //                       | 11|         | 11|  | 11|
  //                       +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                   5 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 3 |------Token (token02)
  //                                     +---+         (Target)
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 2 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |------Token (token00)
  //                                     +---+
  //
  it('should fetch updated Token in pruned region', async () => {
    // Insert a Token entity at the tail and update in pruned region.
    const token00 = await insertDummyToken(db, tail);

    const token02 = _.cloneDeep(token00);
    token02.txCount++;
    await insertDummyToken(db, blocks[0][2], token02);

    const token44 = _.cloneDeep(token00);
    token44.txCount++;
    await insertDummyToken(db, blocks[4][4], token44);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: token00.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(token02.id);
      expect(searchedToken?.txCount).to.be.equal(token02.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(token02.blockNumber);
      expect(searchedToken?.blockHash).to.be.equal(token02.blockHash);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //                                     | 20|            | 15|------Token (token44)
  //                                     +---+            +---+
  //                                       |             /
  //           Token (token30)-------\     |            /
  //              (Target)           -\   8 Blocks   3 Blocks
  //                                  -\   |          /
  //                                   -\  |         /
  //                       +---+         +---+  +---+
  //                       | 11|         | 11|  | 11|
  //                       +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                   7 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |------Token (token00)
  //                                     +---+
  //
  it('should fetch the Token in frothy region', async () => {
    // Insert a Token entity at tail and in the frothy region.
    const token00 = await insertDummyToken(db, tail);

    const token30 = _.cloneDeep(token00);
    token30.txCount++;
    await insertDummyToken(db, blocks[3][0], token30);

    const token44 = _.cloneDeep(token00);
    token44.txCount++;
    await insertDummyToken(db, blocks[4][4], token44);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: token00.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(token30.id);
      expect(searchedToken?.txCount).to.be.equal(token30.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(token30.blockNumber);
      expect(searchedToken?.blockHash).to.be.equal(token30.blockHash);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //                                     | 20|            | 15|
  //                                     +---+            +---+
  //                                       |             /
  //           Token (token30)-------\     |            /
  //              (Target)           -\   8 Blocks   3 Blocks
  //                                  -\   |          /
  //                                   -\  |         /
  //                       +---+         +---+  +---+
  //            Token------| 11|         | 11|  | 11|------Token (token40)
  //           (token11)   +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |------Token (token08)
  //                                     +---+
  //                                       |
  //                                       |
  //                                   7 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |
  //                                     +---+
  //
  it('should fetch the Token in frothy region (same block number)', async () => {
    // Insert a Token entity in the frothy region at same block numbers.
    const token08 = await insertDummyToken(db, blocks[0][8]);

    const token11 = _.cloneDeep(token08);
    token11.txCount++;
    await insertDummyToken(db, blocks[1][1], token11);

    const token30 = _.cloneDeep(token08);
    token30.txCount++;
    await insertDummyToken(db, blocks[3][0], token30);

    const token40 = _.cloneDeep(token08);
    token40.txCount++;
    await insertDummyToken(db, blocks[4][0], token40);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: token08.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(token30.id);
      expect(searchedToken?.txCount).to.be.equal(token30.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(token30.blockNumber);
      expect(searchedToken?.blockHash).to.be.equal(token30.blockHash);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //                                     | 20|            | 15|------Token (token44)
  //                                     +---+            +---+
  //                                       |             /
  //                                       |            /
  //                                   8 Blocks     3 Blocks
  //                                       |          /
  //                                       |         /
  //                       +---+         +---+  +---+
  //                       | 11|         | 11|  | 11|
  //                       +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                   7 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |
  //                                     +---+
  //
  it('should not fetch the Token from a side branch in frothy region', async () => {
    // Insert a Token entity in the frothy region in a side branch.
    const token44 = await insertDummyToken(db, blocks[4][4]);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: token44.id, blockHash: head.hash });
      expect(searchedToken).to.be.undefined;

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //                                     | 20|            | 15|------TokenA (tokenA44)
  //                                     +---+            +---+
  //                                       |             /
  //                                       |            /
  //                                      8 Blocks   3 Blocks
  //                                       |          /
  //                                       |         /
  //                       +---+         +---+  +---+
  //                       | 11|         | 11|  | 11|
  //                       +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                   6 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 2 |------TokenB
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |------TokenA (tokenA00)
  //                                     +---+        (Target)
  //
  it('should fetch Token in pruned region (multiple tokens)', async () => {
    // Insert multiple Token entities in the pruned region.
    const tokenA00 = await insertDummyToken(db, tail);

    await insertDummyToken(db, blocks[0][1]);

    const tokenA44 = _.cloneDeep(tokenA00);
    tokenA44.txCount++;
    await insertDummyToken(db, blocks[4][4], tokenA44);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: tokenA00.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(tokenA00.id);
      expect(searchedToken?.txCount).to.be.equal(tokenA00.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(tokenA00.blockNumber);
      expect(searchedToken?.blockHash).to.be.equal(tokenA00.blockHash);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+            +---+
  //              TokenB (tokenB39)------| 20|            | 15|------TokenA (tokenA44)
  //                                     +---+            +---+
  //                                       |             /
  //         TokenA (tokenA30)-------\     |            /
  //             (Target)            -\   8 Blocks   3 Blocks
  //                                  -\   |          /
  //                                   -\  |         /
  //                       +---+         +---+  +---+
  //                       | 11|         | 11|  | 11|
  //                       +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |
  //                                     +---+
  //                                       |
  //                                       |
  //                                   6 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 2 |------TokenB (tokenB01)
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |------TokenA (tokenA00)
  //                                     +---+
  //
  it('should fetch the Token in frothy region (multiple tokens)', async () => {
    // Insert multiple Token entities in the pruned region and in the frothy region.
    const tokenA00 = await insertDummyToken(db, tail);

    const tokenB01 = await insertDummyToken(db, blocks[0][1]);

    const tokenA30 = _.cloneDeep(tokenA00);
    tokenA30.txCount++;
    await insertDummyToken(db, blocks[3][0], tokenA30);

    const tokenA44 = _.cloneDeep(tokenA00);
    tokenA44.txCount++;
    await insertDummyToken(db, blocks[4][4], tokenA44);

    const tokenB39 = _.cloneDeep(tokenB01);
    tokenB39.txCount++;
    await insertDummyToken(db, blocks[3][9], tokenB39);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: tokenA00.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(tokenA30.id);
      expect(searchedToken?.txCount).to.be.equal(tokenA30.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(tokenA30.blockNumber);
      expect(searchedToken?.blockHash).to.be.equal(tokenA30.blockHash);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });

  //
  //                                     +---+
  //                           head----->| 21|
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+                   +---+
  //                                     | 20|                   | 15|
  //                                     +---+                   +---+
  //                                       |                    /
  //                                       |                   /
  //                                   7 Blocks             2 Blocks
  //                                       |                 /
  //                                       |                /
  //              TokenB (tokenB31)      +---+         +---+
  //              TokenA (tokenA31)------| 12|         | 12|------TokenA (tokenA41)
  //                  (Target)           +---+         +---+
  //                                       |          /
  //                                       |         /
  //                       +---+         +---+  +---+
  //                       | 11|         | 11|  | 11|
  //                       +---+         +---+  +---+
  //                            \          |   /
  //                             \         |  /
  //                              +---+  +---+
  //                              | 10|  | 10|
  //                              +---+  +---+
  //                                   \   |
  //                                    \  |
  //                                     +---+
  //                                     | 9 |------TokenA (tokenA08)
  //                                     +---+
  //                                       |
  //                                       |
  //                                     +---+
  //                                     | 8 |------TokenB (tokenB07)
  //                                     +---+
  //                                       |
  //                                       |
  //                                   6 Blocks
  //                                       |
  //                                       |
  //                                     +---+
  //                           tail----->| 1 |
  //                                     +---+
  //
  it('should fetch the Token in frothy region (same block number) (multiple tokens)', async () => {
    // Insert multiple Token entities in the frothy region at same block numbers.
    const tokenB07 = await insertDummyToken(db, blocks[0][7]);

    const tokenA08 = await insertDummyToken(db, blocks[0][8]);

    const tokenA31 = _.cloneDeep(tokenA08);
    tokenA31.txCount++;
    await insertDummyToken(db, blocks[3][1], tokenA31);

    const tokenB31 = _.cloneDeep(tokenB07);
    tokenB31.txCount++;
    await insertDummyToken(db, blocks[3][1], tokenB31);

    const tokenA41 = _.cloneDeep(tokenA08);
    tokenA41.txCount++;
    await insertDummyToken(db, blocks[4][1], tokenA41);

    const dbTx = await db.createTransactionRunner();
    try {
      const searchedToken = await db.getToken(dbTx, { id: tokenA08.id, blockHash: head.hash });
      expect(searchedToken).to.not.be.empty;
      expect(searchedToken?.id).to.be.equal(tokenA31.id);
      expect(searchedToken?.txCount).to.be.equal(tokenA31.txCount.toString());
      expect(searchedToken?.blockNumber).to.be.equal(tokenA31.blockNumber);
      expect(searchedToken?.blockHash).to.be.equal(tokenA31.blockHash);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  });
});
