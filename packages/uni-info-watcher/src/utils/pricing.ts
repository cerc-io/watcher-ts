//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { BigNumber } from 'ethers';
import { QueryRunner } from 'typeorm';

import { GraphDecimal } from '@vulcanize/util';

import { exponentToBigDecimal, safeDiv } from '.';
import { Database } from '../database';
import { Token } from '../entity/Token';
import { Block } from '../events';

// TODO: Move constants to config.
const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const USDC_WETH_03_POOL = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8';

// Token where amounts should contribute to tracked volume and liquidity.
// Usually tokens that many tokens are paired with.
// TODO: Load whitelisted tokens from config.
export const WHITELIST_TOKENS: string[] = [
  WETH_ADDRESS, // WETH
  '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  '0x0000000000085d4780b73119b644ae5ecd22b376', // TUSD
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
  '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643', // cDAI
  '0x39aa39c021dfbae8fac545936693ac917d5e7563', // cUSDC
  '0x86fadb80d8d2cff3c3680819e4da99c10232ba0f', // EBASE
  '0x57ab1ec28d129707052df4df418d58a2d46d5f51', // sUSD
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', // MKR
  '0xc00e94cb662c3520282e6f5717214004a7f26888', // COMP
  '0x514910771af9ca656af840dff83e8264ecf986ca', // LINK
  '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', // SNX
  '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e', // YFI
  '0x111111111117dc0aa78b770fa6a738034120c302', // 1INCH
  '0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8', // yCurv
  '0x956f47f50a910163d8bf957cf5846d573e7f87ca', // FEI
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', // MATIC
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9' // AAVE
];

const STABLE_COINS: string[] = [
  '0x6b175474e89094c44da98b954eedeac495271d0f',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  '0xdac17f958d2ee523a2206206994597c13d831ec7',
  '0x0000000000085d4780b73119b644ae5ecd22b376',
  '0x956f47f50a910163d8bf957cf5846d573e7f87ca',
  '0x4dd28568d05f09b02220b09c2cb307bfd837cb95'
];

const MINIMUM_ETH_LOCKED = new GraphDecimal(52);
const Q192 = 2 ** 192;

// Constants used in demo.
const ETH_PRICE_IN_USD = '3200.00';

export const sqrtPriceX96ToTokenPrices = (sqrtPriceX96: bigint, token0: Token, token1: Token): GraphDecimal[] => {
  const num = new GraphDecimal((sqrtPriceX96 * sqrtPriceX96).toString());
  const denom = new GraphDecimal(Q192.toString());

  const price1 = num
    .div(denom)
    .times(exponentToBigDecimal(token0.decimals))
    .div(exponentToBigDecimal(token1.decimals));

  const price0 = safeDiv(new GraphDecimal('1'), price1);

  return [price0, price1];
};

export const getEthPriceInUSD = async (db: Database, dbTx: QueryRunner, block: Block, isDemo: boolean): Promise<GraphDecimal> => {
  if (isDemo) {
    // For demo purpose in local development.
    const ethPriceInUSD = new GraphDecimal(ETH_PRICE_IN_USD);
    return ethPriceInUSD;
  }

  // Fetch eth prices for each stablecoin.
  const usdcPool = await db.getPool(dbTx, { id: USDC_WETH_03_POOL, blockHash: block.hash }); // DAI is token0.

  if (usdcPool) {
    return usdcPool.token0Price;
  } else {
    return new GraphDecimal(0);
  }
};

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export const findEthPerToken = async (db: Database, dbTx: QueryRunner, token: Token, isDemo: boolean): Promise<GraphDecimal> => {
  if (token.id === WETH_ADDRESS || isDemo) {
    return new GraphDecimal(1);
  }

  const whiteList = token.whitelistPools;
  // For now just take USD from pool with greatest TVL.
  // Need to update this to actually detect best rate based on liquidity distribution.
  let largestLiquidityETH = new GraphDecimal(0);
  let priceSoFar = new GraphDecimal(0);
  const bundle = await db.getBundle(dbTx, { id: '1' });
  assert(bundle);

  // hardcoded fix for incorrect rates
  // if whitelist includes token - get the safe price
  if (STABLE_COINS.includes(token.id)) {
    priceSoFar = safeDiv(new GraphDecimal(1), bundle.ethPriceUSD);
  } else {
    for (let i = 0; i < whiteList.length; ++i) {
      const poolAddress = whiteList[i].id;
      const pool = await db.getPool(dbTx, { id: poolAddress });
      assert(pool);

      if (BigNumber.from(pool.liquidity).gt(0)) {
        if (pool.token0.id === token.id) {
          // whitelist token is token1
          const token1 = pool.token1;

          // get the derived ETH in pool
          const ethLocked = pool.totalValueLockedToken1.times(token1.derivedETH);

          if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_ETH_LOCKED)) {
            largestLiquidityETH = ethLocked;
            // token1 per our token * Eth per token1
            priceSoFar = pool.token1Price.times(token1.derivedETH);
          }
        }
      }
      if (pool.token1.id === token.id) {
        const token0 = pool.token0;
        // Get the derived ETH in pool.
        const ethLocked = pool.totalValueLockedToken0.times(token0.derivedETH);

        if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_ETH_LOCKED)) {
          largestLiquidityETH = ethLocked;
          // token0 per our token * ETH per token0
          priceSoFar = pool.token0Price.times(token0.derivedETH);
        }
      }
    }
  }

  return priceSoFar; // If nothing was found return 0.
};

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist.
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts.
 * If neither is, return 0.
 */
export const getTrackedAmountUSD = async (
  db: Database,
  dbTx: QueryRunner,
  tokenAmount0: GraphDecimal,
  token0: Token,
  tokenAmount1: GraphDecimal,
  token1: Token,
  isDemo: boolean
): Promise<GraphDecimal> => {
  const bundle = await db.getBundle(dbTx, { id: '1' });
  assert(bundle);
  const price0USD = token0.derivedETH.times(bundle.ethPriceUSD);
  const price1USD = token1.derivedETH.times(bundle.ethPriceUSD);

  // Both are whitelist tokens, return sum of both amounts.
  // Use demo mode
  if ((WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) || isDemo) {
    return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD));
  }

  // Take double value of the whitelisted token amount.
  if (WHITELIST_TOKENS.includes(token0.id) && !WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0.times(price0USD).times(new GraphDecimal('2'));
  }

  // Take double value of the whitelisted token amount.
  if (!WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount1.times(price1USD).times(new GraphDecimal('2'));
  }

  // Neither token is on white list, tracked amount is 0.
  return new GraphDecimal(0);
};
