import assert from 'assert';
import { BigNumber } from 'ethers';
import { QueryRunner } from 'typeorm';

import { Database } from '../database';
import { Factory } from '../entity/Factory';
import { PoolDayData } from '../entity/PoolDayData';
import { PoolHourData } from '../entity/PoolHourData';
import { Token } from '../entity/Token';
import { TokenDayData } from '../entity/TokenDayData';
import { TokenHourData } from '../entity/TokenHourData';
import { UniswapDayData } from '../entity/UniswapDayData';
import { Block } from '../events';

/**
 * Tracks global aggregate data over daily windows.
 * @param db
 * @param event
 */
export const updateUniswapDayData = async (db: Database, dbTx: QueryRunner, event: { contractAddress: string, block: Block }): Promise<UniswapDayData> => {
  const { block } = event;

  // TODO: In subgraph factory is fetched by hardcoded factory address.
  // Currently fetching first factory in database as only one exists.
  const [factory] = await db.getEntities(dbTx, Factory, { hash: block.hash }, {}, { limit: 1 });

  const dayID = Math.floor(block.timestamp / 86400); // Rounded.
  const dayStartTimestamp = dayID * 86400;

  let uniswapDayData = await db.getUniswapDayData(dbTx, { id: dayID.toString(), blockHash: block.hash });

  if (!uniswapDayData) {
    uniswapDayData = new UniswapDayData();
    uniswapDayData.id = dayID.toString();
    uniswapDayData.date = dayStartTimestamp;
    uniswapDayData.tvlUSD = factory.totalValueLockedUSD;
    uniswapDayData.txCount = factory.txCount;
  }

  uniswapDayData.tvlUSD = factory.totalValueLockedUSD;
  uniswapDayData.txCount = factory.txCount;
  return db.saveUniswapDayData(dbTx, uniswapDayData, block);
};

export const updatePoolDayData = async (db: Database, dbTx: QueryRunner, event: { contractAddress: string, block: Block }): Promise<PoolDayData> => {
  const { contractAddress, block } = event;
  const dayID = Math.floor(block.timestamp / 86400);
  const dayStartTimestamp = dayID * 86400;

  const dayPoolID = contractAddress
    .concat('-')
    .concat(dayID.toString());

  const pool = await db.getPool(dbTx, { id: contractAddress, blockHash: block.hash });
  assert(pool);

  let poolDayData = await db.getPoolDayData(dbTx, { id: dayPoolID, blockHash: block.hash });

  if (!poolDayData) {
    poolDayData = new PoolDayData();
    poolDayData.id = dayPoolID;
    poolDayData.date = dayStartTimestamp;
    poolDayData.pool = pool;
    poolDayData.open = pool.token0Price;
    poolDayData.high = pool.token0Price;
    poolDayData.low = pool.token0Price;
    poolDayData.close = pool.token0Price;
    poolDayData = await db.savePoolDayData(dbTx, poolDayData, block);
  }

  if (Number(pool.token0Price) > Number(poolDayData.high)) {
    poolDayData.high = pool.token0Price;
  }

  if (Number(pool.token0Price) < Number(poolDayData.low)) {
    poolDayData.low = pool.token0Price;
  }

  poolDayData.liquidity = pool.liquidity;
  poolDayData.sqrtPrice = pool.sqrtPrice;
  poolDayData.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128;
  poolDayData.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128;
  poolDayData.token0Price = pool.token0Price;
  poolDayData.token1Price = pool.token1Price;
  poolDayData.tick = pool.tick;
  poolDayData.tvlUSD = pool.totalValueLockedUSD;
  poolDayData.txCount = BigInt(BigNumber.from(poolDayData.txCount).add(1).toHexString());
  poolDayData = await db.savePoolDayData(dbTx, poolDayData, block);

  return poolDayData;
};

export const updatePoolHourData = async (db: Database, dbTx: QueryRunner, event: { contractAddress: string, block: Block }): Promise<PoolHourData> => {
  const { contractAddress, block } = event;
  const hourIndex = Math.floor(block.timestamp / 3600); // Get unique hour within unix history.
  const hourStartUnix = hourIndex * 3600; // Want the rounded effect.

  const hourPoolID = contractAddress
    .concat('-')
    .concat(hourIndex.toString());

  const pool = await db.getPool(dbTx, { id: contractAddress, blockHash: block.hash });
  assert(pool);

  let poolHourData = await db.getPoolHourData(dbTx, { id: hourPoolID, blockHash: block.hash });

  if (!poolHourData) {
    poolHourData = new PoolHourData();
    poolHourData.id = hourPoolID;
    poolHourData.periodStartUnix = hourStartUnix;
    poolHourData.pool = pool;
    poolHourData.open = pool.token0Price;
    poolHourData.high = pool.token0Price;
    poolHourData.low = pool.token0Price;
    poolHourData.close = pool.token0Price;
    poolHourData = await db.savePoolHourData(dbTx, poolHourData, block);
  }

  if (Number(pool.token0Price) > Number(poolHourData.high)) {
    poolHourData.high = pool.token0Price;
  }
  if (Number(pool.token0Price) < Number(poolHourData.low)) {
    poolHourData.low = pool.token0Price;
  }

  poolHourData.liquidity = pool.liquidity;
  poolHourData.sqrtPrice = pool.sqrtPrice;
  poolHourData.token0Price = pool.token0Price;
  poolHourData.token1Price = pool.token1Price;
  poolHourData.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128;
  poolHourData.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128;
  poolHourData.close = pool.token0Price;
  poolHourData.tick = pool.tick;
  poolHourData.tvlUSD = pool.totalValueLockedUSD;
  poolHourData.txCount = BigInt(BigNumber.from(poolHourData.txCount).add(1).toHexString());
  poolHourData = await db.savePoolHourData(dbTx, poolHourData, block);

  return poolHourData;
};

export const updateTokenDayData = async (db: Database, dbTx: QueryRunner, token: Token, event: { block: Block }): Promise<TokenDayData> => {
  const { block } = event;
  const bundle = await db.getBundle(dbTx, { id: '1', blockHash: block.hash });
  assert(bundle);
  const dayID = Math.floor(block.timestamp / 86400);
  const dayStartTimestamp = dayID * 86400;

  const tokenDayID = token.id
    .concat('-')
    .concat(dayID.toString());

  const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD);

  let tokenDayData = await db.getTokenDayData(dbTx, { id: tokenDayID, blockHash: block.hash });

  if (!tokenDayData) {
    tokenDayData = new TokenDayData();
    tokenDayData.id = tokenDayID;
    tokenDayData.date = dayStartTimestamp;
    tokenDayData.token = token;
    tokenDayData.open = tokenPrice;
    tokenDayData.high = tokenPrice;
    tokenDayData.low = tokenPrice;
    tokenDayData.close = tokenPrice;
    tokenDayData.priceUSD = token.derivedETH.times(bundle.ethPriceUSD);
    tokenDayData.totalValueLocked = token.totalValueLocked;
    tokenDayData.totalValueLockedUSD = token.totalValueLockedUSD;
  }

  if (tokenPrice.gt(tokenDayData.high)) {
    tokenDayData.high = tokenPrice;
  }

  if (tokenPrice.lt(tokenDayData.low)) {
    tokenDayData.low = tokenPrice;
  }

  tokenDayData.close = tokenPrice;
  tokenDayData.priceUSD = token.derivedETH.times(bundle.ethPriceUSD);
  tokenDayData.totalValueLocked = token.totalValueLocked;
  tokenDayData.totalValueLockedUSD = token.totalValueLockedUSD;
  return db.saveTokenDayData(dbTx, tokenDayData, block);
};

export const updateTokenHourData = async (db: Database, dbTx: QueryRunner, token: Token, event: { block: Block }): Promise<TokenHourData> => {
  const { block } = event;
  const bundle = await db.getBundle(dbTx, { id: '1', blockHash: block.hash });
  assert(bundle);
  const hourIndex = Math.floor(block.timestamp / 3600); // Get unique hour within unix history.
  const hourStartUnix = hourIndex * 3600; // Want the rounded effect.

  const tokenHourID = token.id
    .concat('-')
    .concat(hourIndex.toString());

  const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD);

  let tokenHourData = await db.getTokenHourData(dbTx, { id: tokenHourID, blockHash: block.hash });

  if (!tokenHourData) {
    tokenHourData = new TokenHourData();
    tokenHourData.id = tokenHourID;
    tokenHourData.periodStartUnix = hourStartUnix;
    tokenHourData.token = token;
    tokenHourData.open = tokenPrice;
    tokenHourData.high = tokenPrice;
    tokenHourData.low = tokenPrice;
    tokenHourData.close = tokenPrice;
    tokenHourData.priceUSD = tokenPrice;
    tokenHourData.totalValueLocked = token.totalValueLocked;
    tokenHourData.totalValueLockedUSD = token.totalValueLockedUSD;
  }

  if (tokenPrice.gt(tokenHourData.high)) {
    tokenHourData.high = tokenPrice;
  }

  if (tokenPrice.lt(tokenHourData.low)) {
    tokenHourData.low = tokenPrice;
  }

  tokenHourData.close = tokenPrice;
  tokenHourData.priceUSD = tokenPrice;
  tokenHourData.totalValueLocked = token.totalValueLocked;
  tokenHourData.totalValueLockedUSD = token.totalValueLockedUSD;
  return db.saveTokenHourData(dbTx, tokenHourData, block);
};
