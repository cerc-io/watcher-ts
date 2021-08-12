//
// Copyright 2021 Vulcanize, Inc.
//

import Chance from 'chance';
import { ethers } from 'ethers';

export const NO_OF_BLOCKS = 3;

export interface Entity {
  blockNumber: number
  id: string
  [field: string]: any
}

export class Data {
  static _instance: Data;

  _entities: {[key: string]: Array<Entity>} = {
    bundles: [],
    burns: [],
    transactions: [],
    pools: [],
    tokens: [],
    factories: [],
    mints: [],
    swaps: [],
    poolDayDatas: [],
    tokenDayDatas: [],
    uniswapDayDatas: [],
    ticks: [],
    tokenHourDatas: []
  }

  _chance: Chance.Chance

  constructor () {
    this._chance = new Chance();
    this._generateData();
  }

  static getInstance (): Data {
    if (!this._instance) {
      this._instance = new Data();
    }
    return this._instance;
  }

  get entities (): {[key: string]: Array<Entity>} {
    return this._entities;
  }

  _generateData (): void {
    const factoryAddress = this._getRandomAddress();

    // Generate data for each block.
    Array.from(Array(NO_OF_BLOCKS))
      .forEach((_, blockNumber) => {
        // Generate data for Factory.
        this._entities.factories.push({
          blockNumber,
          id: factoryAddress,
          totalFeesUSD: this._chance.floating({ min: 1, fixed: 2 }),
          totalValueLockedUSD: this._chance.floating({ min: 1, fixed: 2 }),
          totalVolumeUSD: this._chance.floating({ min: 1, fixed: 2 }),
          txCount: this._chance.integer({ min: 1 })
        });

        // Generate Bundle.
        this._entities.bundles.push({
          blockNumber,
          id: '1',
          ethPriceUSD: this._chance.floating({ min: 1, fixed: 2 })
        });

        // Generate Pools.
        Array.from(Array(3))
          .forEach(() => {
            const token0 = {
              blockNumber: blockNumber,
              id: this._getRandomAddress(),
              symbol: this._chance.string({ length: 3, casing: 'upper', alpha: false }),
              name: this._chance.word({ syllables: 1 }),
              volume: this._chance.integer({ min: 1 }),
              volumeUSD: this._chance.floating({ min: 1, fixed: 2 }),
              feesUSD: this._chance.floating({ min: 1, fixed: 2 }),
              txCount: this._chance.integer({ min: 1 }),
              totalValueLocked: this._chance.integer({ min: 1 }),
              totalValueLockedUSD: this._chance.floating({ min: 1, fixed: 2 }),
              derivedETH: this._chance.floating({ min: 1, fixed: 2 })
            };

            const token1 = {
              blockNumber: blockNumber,
              id: this._getRandomAddress(),
              symbol: this._chance.string({ length: 3, casing: 'upper', alpha: false }),
              name: this._chance.word({ syllables: 1 }),
              volume: this._chance.integer({ min: 1 }),
              volumeUSD: this._chance.floating({ min: 1, fixed: 2 }),
              feesUSD: this._chance.floating({ min: 1, fixed: 2 }),
              txCount: this._chance.integer({ min: 1 }),
              totalValueLocked: this._chance.integer({ min: 1 }),
              totalValueLockedUSD: this._chance.floating({ min: 1, fixed: 2 }),
              derivedETH: this._chance.floating({ min: 1, fixed: 2 })
            };

            const pool = {
              blockNumber: blockNumber,
              id: this._getRandomAddress(),
              token0: token0.id,
              token1: token1.id,
              feeTier: this._chance.integer({ min: 1 }),
              liquidity: this._chance.integer({ min: 1 }),
              sqrtPrice: this._chance.integer({ min: 1 }),
              token0Price: this._chance.floating({ min: 1, fixed: 2 }),
              token1Price: this._chance.floating({ min: 1, fixed: 2 }),
              tick: this._chance.integer({ min: 1 }),
              volumeUSD: this._chance.floating({ min: 1, fixed: 2 }),
              txCount: this._chance.integer({ min: 1 }),
              totalValueLockedToken0: this._chance.integer({ min: 1 }),
              totalValueLockedToken1: this._chance.integer({ min: 1 }),
              totalValueLockedUSD: this._chance.floating({ min: 1, fixed: 2 })
            };

            const timestamp = this._chance.timestamp();

            this._entities.poolDayDatas.push({
              blockNumber,
              date: timestamp,
              id: String(timestamp),
              tvlUSD: this._chance.floating({ min: 1, fixed: 2 }),
              volumeUSD: this._chance.floating({ min: 1, fixed: 2 })
            });

            this._entities.tokenDayDatas.push(
              {
                blockNumber,
                date: timestamp,
                id: `${token0.id}-${timestamp}`,
                totalValueLockedUSD: this._chance.floating({ min: 1, fixed: 2 }),
                volumeUSD: this._chance.floating({ min: 1, fixed: 2 })
              },
              {
                blockNumber,
                date: timestamp,
                id: `${token1.id}-${timestamp}`,
                totalValueLockedUSD: this._chance.floating({ min: 1, fixed: 2 }),
                volumeUSD: this._chance.floating({ min: 1, fixed: 2 })
              }
            );

            this._entities.uniswapDayDatas.push({
              blockNumber,
              date: timestamp,
              id: String(timestamp),
              tvlUSD: this._chance.floating({ min: 1, fixed: 2 }),
              volumeUSD: this._chance.floating({ min: 1, fixed: 2 })
            });

            this._entities.ticks.push({
              blockNumber,
              id: `${pool.id}#${this._chance.integer({ min: 1 })}`,
              liquidityGross: this._chance.integer({ min: 1 }),
              liquidityNet: this._chance.integer({ min: 1 }),
              price0: this._chance.floating({ min: 1, fixed: 2 }),
              price1: this._chance.floating({ min: 1, fixed: 2 }),
              tickIdx: this._chance.integer({ min: 1 })
            });

            this._entities.tokenHourDatas.push(
              {
                blockNumber,
                close: this._chance.floating({ min: 1, fixed: 2 }),
                high: this._chance.floating({ min: 1, fixed: 2 }),
                id: `${token0.id}-${timestamp}`,
                low: this._chance.floating({ min: 1, fixed: 2 }),
                open: this._chance.floating({ min: 1, fixed: 2 }),
                periodStartUnix: timestamp
              },
              {
                blockNumber,
                close: this._chance.floating({ min: 1, fixed: 2 }),
                high: this._chance.floating({ min: 1, fixed: 2 }),
                id: `${token1.id}-${timestamp}`,
                low: this._chance.floating({ min: 1, fixed: 2 }),
                open: this._chance.floating({ min: 1, fixed: 2 }),
                periodStartUnix: timestamp
              }
            );

            this._entities.tokens.push(token0, token1);
            this._entities.pools.push(pool);

            // Generate Transactions.
            Array.from(Array(3))
              .forEach((_, transactionIndex) => {
                const transactionHash = ethers.utils.hexlify(ethers.utils.randomBytes(32));

                const transaction = {
                  blockNumber,
                  id: transactionHash,
                  timestamp: this._chance.timestamp()
                };

                this._entities.transactions.push(transaction);

                // Generate Burns
                this._entities.burns.push({
                  id: `${transaction.id}#${transactionIndex}`,
                  blockNumber,
                  transaction: transaction.id,
                  pool: pool.id,
                  timestamp: this._chance.timestamp(),
                  owner: this._getRandomAddress(),
                  origin: this._getRandomAddress(),
                  amount0: this._chance.integer({ min: 1 }),
                  amount1: this._chance.integer({ min: 1 }),
                  amountUSD: this._chance.floating({ min: 1, fixed: 2 })
                });

                // Generate Mints
                this._entities.mints.push({
                  id: `${transaction.id}#${transactionIndex}`,
                  blockNumber,
                  transaction: transaction.id,
                  pool: pool.id,
                  timestamp: this._chance.timestamp(),
                  owner: this._getRandomAddress(),
                  origin: this._getRandomAddress(),
                  amount0: this._chance.integer({ min: 1 }),
                  amount1: this._chance.integer({ min: 1 }),
                  amountUSD: this._chance.floating({ min: 1, fixed: 2 }),
                  sender: this._getRandomAddress()
                });

                // Generate Swaps
                this._entities.swaps.push({
                  id: `${transaction.id}#${transactionIndex}`,
                  blockNumber,
                  transaction: transaction.id,
                  pool: pool.id,
                  timestamp: this._chance.timestamp(),
                  origin: this._getRandomAddress(),
                  amount0: this._chance.integer({ min: 1 }),
                  amount1: this._chance.integer({ min: 1 }),
                  amountUSD: this._chance.floating({ min: 1, fixed: 2 })
                });
              });
          });
      });
  }

  _getRandomAddress (): string {
    return ethers.utils.hexlify(ethers.utils.randomBytes(20));
  }
}
