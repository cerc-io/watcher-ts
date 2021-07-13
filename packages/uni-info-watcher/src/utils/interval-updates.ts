import { BigNumber } from 'ethers';

import { Database } from '../database';
import { PoolDayData } from '../entity/PoolDayData';
import { PoolHourData } from '../entity/PoolHourData';
import { Token } from '../entity/Token';
import { TokenDayData } from '../entity/TokenDayData';
import { TokenHourData } from '../entity/TokenHourData';
import { UniswapDayData } from '../entity/UniswapDayData';

/**
 * Tracks global aggregate data over daily windows.
 * @param db
 * @param event
 */
export const updateUniswapDayData = async (db: Database, event: { contractAddress: string, blockNumber: number }): Promise<UniswapDayData> => {
  const { blockNumber } = event;
  // TODO: In subgraph factory is fetched by hardcoded factory address.
  // Currently fetching first factory in database as only one exists.
  const [factory] = await db.getFactories({ blockNumber }, { limit: 1 });

  // TODO: Get block timestamp from event.
  // let timestamp = event.block.timestamp.toI32()
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp.

  const dayID = Math.floor(timestamp / 86400); // Rounded.
  const dayStartTimestamp = dayID * 86400;

  const uniswapDayData = await db.loadUniswapDayData({
    id: dayID.toString(),
    blockNumber,
    date: dayStartTimestamp,
    tvlUSD: factory.totalValueLockedUSD,
    txCount: factory.txCount
  });

  uniswapDayData.tvlUSD = factory.totalValueLockedUSD;
  uniswapDayData.txCount = factory.txCount;
  return db.saveUniswapDayData(uniswapDayData, blockNumber);
};

export const updatePoolDayData = async (db: Database, event: { contractAddress: string, blockNumber: number }): Promise<PoolDayData> => {
  const { contractAddress, blockNumber } = event;

  // TODO: Get block timestamp from event.
  // let timestamp = event.block.timestamp.toI32()
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp.

  const dayID = Math.floor(timestamp / 86400);
  const dayStartTimestamp = dayID * 86400;

  const dayPoolID = contractAddress
    .concat('-')
    .concat(dayID.toString());

  const pool = await db.loadPool({ id: contractAddress, blockNumber });

  let poolDayData = await db.loadPoolDayData({
    id: dayPoolID,
    blockNumber,
    date: dayStartTimestamp,
    pool: pool,
    open: pool.token0Price,
    high: pool.token0Price,
    low: pool.token0Price,
    close: pool.token0Price
  });

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
  poolDayData = await db.savePoolDayData(poolDayData, blockNumber);

  return poolDayData;
};

export const updatePoolHourData = async (db: Database, event: { contractAddress: string, blockNumber: number }): Promise<PoolHourData> => {
  const { contractAddress, blockNumber } = event;

  // TODO: Get block timestamp from event.
  // let timestamp = event.block.timestamp.toI32()
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp.

  const hourIndex = Math.floor(timestamp / 3600); // Get unique hour within unix history.
  const hourStartUnix = hourIndex * 3600; // Want the rounded effect.

  const hourPoolID = contractAddress
    .concat('-')
    .concat(hourIndex.toString());

  const pool = await db.loadPool({ id: contractAddress, blockNumber });

  let poolHourData = await db.loadPoolHourData({
    id: hourPoolID,
    blockNumber,
    periodStartUnix: hourStartUnix,
    pool: pool,
    open: pool.token0Price,
    high: pool.token0Price,
    low: pool.token0Price,
    close: pool.token0Price
  });

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
  poolHourData = await db.savePoolHourData(poolHourData, blockNumber);

  return poolHourData;
};

export const updateTokenDayData = async (db: Database, token: Token, event: { blockNumber: number }): Promise<TokenDayData> => {
  const { blockNumber } = event;
  const bundle = await db.loadBundle({ id: '1', blockNumber });

  // TODO: Get block timestamp from event.
  // let timestamp = event.block.timestamp.toI32()
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp.

  const dayID = Math.floor(timestamp / 86400);
  const dayStartTimestamp = dayID * 86400;

  const tokenDayID = token.id
    .concat('-')
    .concat(dayID.toString());

  const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD);

  const tokenDayData = await db.loadTokenDayData({
    id: tokenDayID,
    blockNumber,
    date: dayStartTimestamp,
    token,
    open: tokenPrice,
    high: tokenPrice,
    low: tokenPrice,
    close: tokenPrice,
    priceUSD: token.derivedETH.times(bundle.ethPriceUSD),
    totalValueLocked: token.totalValueLocked,
    totalValueLockedUSD: token.totalValueLockedUSD
  });

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
  return db.saveTokenDayData(tokenDayData, blockNumber);
};

export const updateTokenHourData = async (db: Database, token: Token, event: { blockNumber: number }): Promise<TokenHourData> => {
  const { blockNumber } = event;
  const bundle = await db.loadBundle({ id: '1', blockNumber });

  // TODO: Get block timestamp from event.
  // let timestamp = event.block.timestamp.toI32()
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp.

  const hourIndex = Math.floor(timestamp / 3600); // Get unique hour within unix history.
  const hourStartUnix = hourIndex * 3600; // Want the rounded effect.

  const tokenHourID = token.id
    .concat('-')
    .concat(hourIndex.toString());

  const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD);

  const tokenHourData = await db.loadTokenHourData({
    id: tokenHourID,
    blockNumber,
    periodStartUnix: hourStartUnix,
    token: token,
    open: tokenPrice,
    high: tokenPrice,
    low: tokenPrice,
    close: tokenPrice,
    priceUSD: tokenPrice,
    totalValueLocked: token.totalValueLocked,
    totalValueLockedUSD: token.totalValueLockedUSD
  });

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
  return db.saveTokenHourData(tokenHourData, blockNumber);
};
