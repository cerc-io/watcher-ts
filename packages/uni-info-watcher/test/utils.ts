//
// Copyright 2021 Vulcanize, Inc.
//

import { expect } from 'chai';
import { ethers } from 'ethers';
import Decimal from 'decimal.js';
import _ from 'lodash';

import { insertNDummyBlocks } from '@vulcanize/util/test';

import { Database, OrderDirection } from '../src/database';
import { Block } from '../src/events';
import { Token } from '../src/entity/Token';
import { Client } from '../src/client';

export const checkUniswapDayData = async (client: Client): Promise<void> => {
  // Checked values: date, tvlUSD.
  // Unchecked values: volumeUSD.

  // Get the latest UniswapDayData.
  const uniswapDayDatas = await client.getUniswapDayDatas({}, 0, 1, 'date', OrderDirection.desc);
  expect(uniswapDayDatas).to.not.be.empty;

  const id: string = uniswapDayDatas[0].id;
  const dayID = Number(id);
  const date = uniswapDayDatas[0].date;
  const tvlUSD = uniswapDayDatas[0].tvlUSD;

  const dayStartTimestamp = dayID * 86400;
  const factories = await client.getFactories(1);
  const totalValueLockedUSD: string = factories[0].totalValueLockedUSD;

  expect(date).to.be.equal(dayStartTimestamp);
  expect(tvlUSD).to.be.equal(totalValueLockedUSD);
};

export const checkPoolDayData = async (client: Client, poolAddress: string): Promise<void> => {
  // Checked values: id, date, tvlUSD.
  // Unchecked values: volumeUSD.

  // Get the latest PoolDayData.
  const poolDayDatas = await client.getPoolDayDatas({ pool: poolAddress }, 0, 1, 'date', OrderDirection.desc);
  expect(poolDayDatas).to.not.be.empty;

  const dayPoolID: string = poolDayDatas[0].id;
  const poolID: string = dayPoolID.split('-')[0];
  const dayID = Number(dayPoolID.split('-')[1]);
  const date = poolDayDatas[0].date;
  const tvlUSD = poolDayDatas[0].tvlUSD;

  const dayStartTimestamp = dayID * 86400;
  const poolData = await client.getPoolById(poolAddress);
  const totalValueLockedUSD: string = poolData.pool.totalValueLockedUSD;

  expect(poolID).to.be.equal(poolAddress);
  expect(date).to.be.equal(dayStartTimestamp);
  expect(tvlUSD).to.be.equal(totalValueLockedUSD);
};

export const checkTokenDayData = async (client: Client, tokenAddress: string): Promise<void> => {
  // Checked values: id, date, totalValueLockedUSD.
  // Unchecked values: volumeUSD.

  // Get the latest TokenDayData.
  const tokenDayDatas = await client.getTokenDayDatas({ token: tokenAddress }, 0, 1, 'date', OrderDirection.desc);
  expect(tokenDayDatas).to.not.be.empty;

  const tokenDayID: string = tokenDayDatas[0].id;
  const tokenID: string = tokenDayID.split('-')[0];
  const dayID = Number(tokenDayID.split('-')[1]);
  const date = tokenDayDatas[0].date;
  const tvlUSD = tokenDayDatas[0].totalValueLockedUSD;

  const dayStartTimestamp = dayID * 86400;
  const tokenData = await client.getToken(tokenAddress);
  const totalValueLockedUSD: string = tokenData.token.totalValueLockedUSD;

  expect(tokenID).to.be.equal(tokenAddress);
  expect(date).to.be.equal(dayStartTimestamp);
  expect(tvlUSD).to.be.equal(totalValueLockedUSD);
};

export const checkTokenHourData = async (client: Client, tokenAddress: string): Promise<void> => {
  // Checked values: id, periodStartUnix, low, high, open, close.
  // Unchecked values:

  // Get the latest TokenHourData.
  const tokenHourDatas = await client.getTokenHourDatas({ token: tokenAddress }, 0, 1, 'periodStartUnix', OrderDirection.desc);
  expect(tokenHourDatas).to.not.be.empty;

  const tokenHourID: string = tokenHourDatas[0].id;
  const tokenID: string = tokenHourID.split('-')[0];
  const hourIndex = Number(tokenHourID.split('-')[1]);
  const periodStartUnix = tokenHourDatas[0].periodStartUnix;
  const low = tokenHourDatas[0].low;
  const high = tokenHourDatas[0].high;
  const open = tokenHourDatas[0].open;
  const close = tokenHourDatas[0].close;

  const hourStartUnix = hourIndex * 3600;
  const tokenData = await client.getToken(tokenAddress);
  const bundles = await client.getBundles(1);
  const tokenPrice = new Decimal(tokenData.token.derivedETH).times(bundles[0].ethPriceUSD);

  expect(tokenID).to.be.equal(tokenAddress);
  expect(periodStartUnix).to.be.equal(hourStartUnix);
  expect(low).to.be.equal(tokenPrice.toString());
  expect(high).to.be.equal(tokenPrice.toString());
  expect(open).to.be.equal(tokenPrice.toString());
  expect(close).to.be.equal(tokenPrice.toString());
};

export const fetchTransaction = async (client: Client): Promise<{transaction: any}> => {
  // Get the latest Transaction.
  // Get only the latest mint, burn and swap entity in the transaction.
  const transactions = await client.getTransactions(
    1,
    {
      orderBy: 'timestamp',
      mintOrderBy: 'timestamp',
      burnOrderBy: 'timestamp',
      swapOrderBy: 'timestamp'
    },
    OrderDirection.desc
  );

  expect(transactions).to.not.be.empty;
  const transaction = transactions[0];

  expect(transaction.mints).to.be.an.instanceOf(Array);
  expect(transaction.burns).to.be.an.instanceOf(Array);
  expect(transaction.swaps).to.be.an.instanceOf(Array);

  return transaction;
};

export const createTestBlockTree = async (db: Database): Promise<Block[][]> => {
  // Create BlockProgress test data.
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
  //                           tail----->| 1 |
  //                                     +---+
  //

  const blocks: Block[][] = [];

  const firstSeg = await insertNDummyBlocks(db, 9);
  const secondSeg = await insertNDummyBlocks(db, 2, _.last(firstSeg));
  const thirdSeg = await insertNDummyBlocks(db, 1, _.last(firstSeg));
  const fourthSeg = await insertNDummyBlocks(db, 11, _.last(thirdSeg));
  const fifthSeg = await insertNDummyBlocks(db, 5, _.last(thirdSeg));

  blocks.push(firstSeg);
  blocks.push(secondSeg);
  blocks.push(thirdSeg);
  blocks.push(fourthSeg);
  blocks.push(fifthSeg);

  return blocks;
};

export const insertDummyToken = async (db: Database, block: Block, token?: Token): Promise<Token> => {
  // Insert a dummy Token entity at block.

  if (!token) {
    const randomByte = ethers.utils.randomBytes(20);
    const tokenAddress = ethers.utils.hexValue(randomByte);

    token = new Token();
    token.symbol = 'TEST';
    token.name = 'TestToken';
    token.id = tokenAddress;
    token.totalSupply = new Decimal(0);
    token.decimals = BigInt(0);
  }

  const dbTx = await db.createTransactionRunner();

  try {
    token = await db.saveToken(dbTx, token, block);
    dbTx.commitTransaction();
    return token;
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }
};
