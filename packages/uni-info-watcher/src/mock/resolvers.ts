//
// Copyright 2021 Vulcanize, Inc.
//

/* eslint-disable camelcase */
import debug from 'debug';
import BigInt from 'apollo-type-bigint';

import { Data, Entity, NO_OF_BLOCKS } from './data';
import { BlockHeight } from '../resolvers';
import { OrderDirection } from '../database';

const log = debug('vulcanize:test');

enum BurnOrderBy {
  timestamp
}

interface BurnFilter {
  pool: string;
  token0: string;
  token1: string;
}

enum MintOrderBy {
  timestamp
}

interface MintFilter {
  pool: string;
  token0: string;
  token1: string;
}

enum PoolOrderBy {
  totalValueLockedUSD
}

interface PoolFilter {
  id: string;
  id_in: [string];
  token0: string;
  token0_in: [string];
  token1: string;
  token1_in: [string];
}

enum TokenOrderBy {
  totalValueLockedUSD
}

interface TokenFilter {
  id: string;
  id_in: [string];
  name_contains: string;
  symbol_contains: string;
}

enum TransactionOrderBy {
  timestamp
}

interface SwapFilter {
  pool: string;
  token0: string;
  token1: string;
}

enum SwapOrderBy {
  timestamp
}

enum DayDataOrderBy {
  date
}

interface DayDataFilter {
  date_gt: number;
  pool: string;
}

interface TickFilter {
  poolAddress: string;
  tickIdx_gte: number;
  tickIdx_lte: number;
}

enum TokenHourDataOrderBy {
  periodStartUnix
}

interface TokenHourDataFilter {
  periodStartUnix_gt: number;
  token: string;
}

export const createResolvers = async (): Promise<any> => {
  const latestBlockNumber = NO_OF_BLOCKS - 1;
  const data = Data.getInstance();
  const { bundles, burns, pools, transactions, factories, mints, tokens, swaps, poolDayDatas, tokenDayDatas, uniswapDayDatas, ticks, tokenHourDatas } = data.entities;

  return {
    BigInt: new BigInt('bigInt'),

    Query: {
      bundle: (_: any, { id: bundleId, block }: { id: string, block: BlockHeight }) => {
        log('bundle', bundleId, block);
        const res = bundles.find((bundle: Entity) => bundle.blockNumber === block.number && bundle.id === bundleId);

        if (res) {
          const { ethPriceUSD, id } = res;
          return { ethPriceUSD, id };
        }
      },

      bundles: (_: any, { first, block }: { first: number, block: BlockHeight }) => {
        log('bundles', first, block);

        const res = bundles.filter((bundle: Entity) => bundle.blockNumber === block.number)
          .slice(0, first)
          .map(({ ethPriceUSD, id }) => ({ ethPriceUSD, id }));

        return res;
      },

      burns: (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: BurnOrderBy, orderDirection: OrderDirection, where: BurnFilter }) => {
        log('burns', first, orderBy, orderDirection, where);

        const res = burns.filter((burn: Entity) => {
          if (burn.blockNumber === latestBlockNumber) {
            return Object.entries(where || {})
              .every(([field, value]) => burn[field] === value);
          }

          return false;
        }).slice(0, first)
          .sort((a: any, b: any) => {
            a = a[orderBy];
            b = b[orderBy];
            return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
          })
          .map(burn => {
            return {
              ...burn,
              pool: pools.find(pool => pool.id === burn.pool),
              transaction: transactions.find(transaction => transaction.id === burn.transaction)
            };
          });

        return res;
      },

      factories: (_: any, { first, block }: { first: number, block: BlockHeight }) => {
        log('factories', first, block);

        const res = factories.filter((factory: Entity) => factory.blockNumber === block.number)
          .slice(0, first);

        return res;
      },

      mints: (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: MintOrderBy, orderDirection: OrderDirection, where: MintFilter }) => {
        log('mints', first, orderBy, orderDirection, where);

        const res = mints.filter((mint: Entity) => {
          if (mint.blockNumber === latestBlockNumber) {
            return Object.entries(where || {})
              .every(([field, value]) => mint[field] === value);
          }

          return false;
        }).slice(0, first)
          .sort((a: any, b: any) => {
            a = a[orderBy];
            b = b[orderBy];
            return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
          })
          .map(mint => {
            return {
              ...mint,
              pool: pools.find(pool => pool.id === mint.pool),
              transaction: transactions.find(transaction => transaction.id === mint.transaction)
            };
          });

        return res;
      },

      pool: (_: any, { id: poolId }: { id: string }) => {
        log('pool', poolId);
        const res = pools.find((pool: Entity) => pool.id === poolId);

        if (res) {
          return {
            ...res,
            token0: tokens.find(token => token.id === res.token0),
            token1: tokens.find(token => token.id === res.token1)
          };
        }
      },

      pools: (_: any, { first, orderBy, orderDirection, where, block }: { first: number, orderBy: PoolOrderBy, orderDirection: OrderDirection, where: PoolFilter, block: BlockHeight }) => {
        log('pools', first, orderBy, orderDirection, where, block);

        const res = pools.filter((pool: Entity) => {
          if (pool.blockNumber === latestBlockNumber) {
            return Object.entries(where || {})
              .every(([filter, value]) => {
                if (filter.endsWith('_in')) {
                  const field = filter.substring(0, filter.length - 3);

                  return value.some((el: any) => el === pool[field]);
                }

                return pool[filter] === value;
              });
          }

          return false;
        }).slice(0, first)
          .sort((a: any, b: any) => {
            a = a[orderBy];
            b = b[orderBy];
            return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
          })
          .map(pool => {
            return {
              ...pool,
              token0: tokens.find(token => token.id === pool.token0),
              token1: tokens.find(token => token.id === pool.token1)
            };
          });

        return res;
      },

      token: (_: any, { id: tokenId, block }: { id: string, block: BlockHeight }) => {
        log('token', tokenId, block);
        const res = tokens.find((token: Entity) => token.blockNumber === block.number && token.id === tokenId);

        return res;
      },

      tokens: (_: any, { orderBy, orderDirection, where }: { orderBy: TokenOrderBy, orderDirection: OrderDirection, where: TokenFilter }) => {
        log('tokens', orderBy, orderDirection, where);

        const res = tokens.filter((token: Entity) => {
          if (token.blockNumber === latestBlockNumber) {
            return Object.entries(where || {})
              .every(([filter, value]) => {
                if (filter.endsWith('_in')) {
                  const field = filter.substring(0, filter.length - 3);

                  return value.some((el: any) => el === token[field]);
                }

                return token[filter] === value;
              });
          }

          return false;
        }).sort((a: any, b: any) => {
          a = a[orderBy];
          b = b[orderBy];
          return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
        });

        return res;
      },

      transactions: (_: any, { first, orderBy, orderDirection }: { first: number, orderBy: TransactionOrderBy, orderDirection: OrderDirection }) => {
        log('transactions', first, orderBy, orderDirection);

        const res = transactions.filter((transaction: Entity) => transaction.blockNumber === latestBlockNumber)
          .slice(0, first)
          .sort((a: any, b: any) => {
            a = a[orderBy];
            b = b[orderBy];
            return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
          })
          .map(transaction => {
            return {
              ...transaction,
              burns: burns.filter(burn => burn.transaction === transaction.id),
              mints: mints.filter(mint => mint.transaction === transaction.id),
              swaps: swaps.filter(swap => swap.transaction === transaction.id)
            };
          });

        return res;
      },

      swaps: (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: SwapOrderBy, orderDirection: OrderDirection, where: SwapFilter }) => {
        log('swaps', first, orderBy, orderDirection, where);

        const res = swaps.filter((swap: Entity) => {
          if (swap.blockNumber === latestBlockNumber) {
            return Object.entries(where || {})
              .every(([field, value]) => swap[field] === value);
          }

          return false;
        }).slice(0, first)
          .sort((a: any, b: any) => {
            a = a[orderBy];
            b = b[orderBy];
            return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
          })
          .map(swap => {
            return {
              ...swap,
              pool: pools.find(pool => pool.id === swap.pool),
              transaction: transactions.find(transaction => transaction.id === swap.transaction)
            };
          });

        return res;
      },

      poolDayDatas: (_: any, { skip, first, orderBy, orderDirection, where }: { skip: number, first: number, orderBy: DayDataOrderBy, orderDirection: OrderDirection, where: DayDataFilter }) => {
        log('poolDayDatas', skip, first, orderBy, orderDirection, where);

        const res = poolDayDatas.filter((poolDayData: Entity) => {
          if (poolDayData.blockNumber === latestBlockNumber) {
            return Object.entries(where || {})
              .every(([filter, value]) => {
                if (filter.endsWith('_gt')) {
                  const field = filter.substring(0, filter.length - 3);

                  return poolDayData[field] > value;
                }

                return poolDayData[filter] === value;
              });
          }

          return false;
        }).slice(skip, skip + first)
          .sort((a: any, b: any) => {
            a = a[orderBy];
            b = b[orderBy];
            return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
          });

        return res;
      },

      tokenDayDatas: (_: any, { skip, first, orderBy, orderDirection, where }: { skip: number, first: number, orderBy: DayDataOrderBy, orderDirection: OrderDirection, where: DayDataFilter }) => {
        log('tokenDayDatas', skip, first, orderBy, orderDirection, where);

        const res = tokenDayDatas.filter((tokenDayData: Entity) => {
          if (tokenDayData.blockNumber === latestBlockNumber) {
            return Object.entries(where || {})
              .every(([filter, value]) => {
                if (filter.endsWith('_gt')) {
                  const field = filter.substring(0, filter.length - 3);

                  return tokenDayData[field] > value;
                }

                return tokenDayData[filter] === value;
              });
          }

          return false;
        }).slice(skip, skip + first)
          .sort((a: any, b: any) => {
            a = a[orderBy];
            b = b[orderBy];
            return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
          });

        return res;
      },

      uniswapDayDatas: (_: any, { skip, first, orderBy, orderDirection, where }: { skip: number, first: number, orderBy: DayDataOrderBy, orderDirection: OrderDirection, where: DayDataFilter }) => {
        log('uniswapDayDatas', skip, first, orderBy, orderDirection, where);

        const res = uniswapDayDatas.filter((uniswapDayData: Entity) => {
          if (uniswapDayData.blockNumber === latestBlockNumber) {
            return Object.entries(where || {})
              .every(([filter, value]) => {
                if (filter.endsWith('_gt')) {
                  const field = filter.substring(0, filter.length - 3);

                  return uniswapDayData[field] > value;
                }

                return uniswapDayData[filter] === value;
              });
          }

          return false;
        }).slice(skip, skip + first)
          .sort((a: any, b: any) => {
            a = a[orderBy];
            b = b[orderBy];
            return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
          });

        return res;
      },

      ticks: (_: any, { skip, first, where, block }: { skip: number, first: number, where: TickFilter, block: BlockHeight }) => {
        log('ticks', skip, first, where, block);

        const res = ticks.filter((tick: Entity) => {
          if (tick.blockNumber === block.number) {
            return Object.entries(where || {})
              .every(([filter, value]) => {
                if (filter.endsWith('_gte')) {
                  const field = filter.substring(0, filter.length - 3);

                  return tick[field] >= value;
                }

                if (filter.endsWith('_lte')) {
                  const field = filter.substring(0, filter.length - 3);

                  return tick[field] <= value;
                }

                return tick[filter] === value;
              });
          }

          return false;
        }).slice(skip, skip + first);

        return res;
      },

      tokenHourDatas: (_: any, { skip, first, orderBy, orderDirection, where }: { skip: number, first: number, orderBy: TokenHourDataOrderBy, orderDirection: OrderDirection, where: TokenHourDataFilter }) => {
        log('tokenHourDatas', skip, first, orderBy, orderDirection, where);

        const res = tokenHourDatas.filter((tokenHourData: Entity) => {
          if (tokenHourData.blockNumber === latestBlockNumber) {
            return Object.entries(where || {})
              .every(([filter, value]) => {
                if (filter.endsWith('_gt')) {
                  const field = filter.substring(0, filter.length - 3);

                  return tokenHourData[field] > value;
                }

                return tokenHourData[filter] === value;
              });
          }

          return false;
        }).slice(skip, skip + first)
          .sort((a: any, b: any) => {
            a = a[orderBy];
            b = b[orderBy];
            return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
          });

        return res;
      }
    }
  };
};
