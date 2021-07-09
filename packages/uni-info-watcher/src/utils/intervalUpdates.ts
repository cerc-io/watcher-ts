import { BigNumber } from 'ethers';

import { Database } from '../database';
import { PoolDayData } from '../entity/PoolDayData';
import { PoolHourData } from '../entity/PoolHourData';

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
