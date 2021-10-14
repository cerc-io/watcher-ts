//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { BlockHeight, OrderDirection } from '@vulcanize/util';

import { Indexer } from './indexer';
import { Burn } from './entity/Burn';
import { Bundle } from './entity/Bundle';
import { Factory } from './entity/Factory';
import { Mint } from './entity/Mint';
import { PoolDayData } from './entity/PoolDayData';
import { Pool } from './entity/Pool';
import { Swap } from './entity/Swap';
import { Tick } from './entity/Tick';
import { Token } from './entity/Token';
import { TokenDayData } from './entity/TokenDayData';
import { TokenHourData } from './entity/TokenHourData';
import { Transaction } from './entity/Transaction';
import { UniswapDayData } from './entity/UniswapDayData';
import { Position } from './entity/Position';
import { EventWatcher } from './events';

const log = debug('vulcanize:resolver');

export { BlockHeight };

export const createResolvers = async (indexer: Indexer, eventWatcher: EventWatcher): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    ChainIndexingStatus: {
      __resolveType: () => {
        return 'EthereumIndexingStatus';
      }
    },

    Subscription: {
      onBlockProgressEvent: {
        subscribe: () => eventWatcher.getBlockProgressEventIterator()
      }
    },

    Query: {
      bundle: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('bundle', id, block);

        return indexer.getBundle(id, block);
      },

      bundles: async (_: any, { block = {}, first }: { first: number, block: BlockHeight }) => {
        log('bundles', block, first);

        return indexer.getEntities(Bundle, block, {}, { limit: first });
      },

      burns: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('burns', first, orderBy, orderDirection, where);

        return indexer.getEntities(Burn, {}, where, { limit: first, orderBy, orderDirection }, ['burn.pool', 'burn.transaction', 'pool.token0', 'pool.token1']);
      },

      factories: async (_: any, { block = {}, first }: { first: number, block: BlockHeight }) => {
        log('factories', block, first);

        return indexer.getEntities(Factory, block, {}, { limit: first });
      },

      mints: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('mints', first, orderBy, orderDirection, where);

        return indexer.getEntities(Mint, {}, where, { limit: first, orderBy, orderDirection }, ['mint.pool', 'mint.transaction', 'pool.token0', 'pool.token1']);
      },

      pool: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('pool', id, block);

        return indexer.getPool(id, block);
      },

      poolDayDatas: async (_: any, { first, skip, orderBy, orderDirection, where }: { first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('poolDayDatas', first, skip, orderBy, orderDirection, where);

        return indexer.getEntities(PoolDayData, {}, where, { limit: first, skip, orderBy, orderDirection });
      },

      pools: async (_: any, { block = {}, first, orderBy, orderDirection, where = {} }: { block: BlockHeight, first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('pools', block, first, orderBy, orderDirection, where);

        return indexer.getEntities(Pool, block, where, { limit: first, orderBy, orderDirection }, ['pool.token0', 'pool.token1']);
      },

      swaps: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('swaps', first, orderBy, orderDirection, where);

        return indexer.getEntities(Swap, {}, where, { limit: first, orderBy, orderDirection }, ['swap.pool', 'swap.transaction', 'pool.token0', 'pool.token1']);
      },

      ticks: async (_: any, { block = {}, first, skip, where = {} }: { block: BlockHeight, first: number, skip: number, where: { [key: string]: any } }) => {
        log('ticks', block, first, skip, where);

        return indexer.getEntities(Tick, block, where, { limit: first, skip });
      },

      token: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('token', id, block);

        return indexer.getToken(id, block);
      },

      tokens: async (_: any, { block = {}, first, orderBy, orderDirection, where }: { block: BlockHeight, first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('tokens', orderBy, orderDirection, where);

        return indexer.getEntities(Token, block, where, { limit: first, orderBy, orderDirection }, ['token.whitelistPools']);
      },

      tokenDayDatas: async (_: any, { first, skip, orderBy, orderDirection, where }: { first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('tokenDayDatas', first, skip, orderBy, orderDirection, where);

        return indexer.getEntities(TokenDayData, {}, where, { limit: first, skip, orderBy, orderDirection });
      },

      tokenHourDatas: async (_: any, { first, skip, orderBy, orderDirection, where }: { first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('tokenHourDatas', first, skip, orderBy, orderDirection, where);

        return indexer.getEntities(TokenHourData, {}, where, { limit: first, skip, orderBy, orderDirection });
      },

      transactions: async (_: any, { first, orderBy, orderDirection }: { first: number, orderBy: string, orderDirection: OrderDirection}) => {
        log('transactions', first, orderBy, orderDirection);

        return indexer.getEntities(
          Transaction,
          {},
          {},
          { limit: first, orderBy, orderDirection },
          [
            'transaction.mints',
            'transaction.burns',
            'transaction.swaps',
            {
              property: 'mints.transaction',
              alias: 'mintsTransaction'
            },
            {
              property: 'burns.transaction',
              alias: 'burnsTransaction'
            },
            {
              property: 'swaps.transaction',
              alias: 'swapsTransaction'
            },
            {
              property: 'mints.pool',
              alias: 'mintsPool'
            },
            {
              property: 'burns.pool',
              alias: 'burnsPool'
            },
            {
              property: 'swaps.pool',
              alias: 'swapsPool'
            },
            {
              property: 'mintsPool.token0',
              alias: 'mintsPoolToken0'
            },
            {
              property: 'mintsPool.token1',
              alias: 'mintsPoolToken1'
            },
            {
              property: 'burnsPool.token0',
              alias: 'burnsPoolToken0'
            },
            {
              property: 'burnsPool.token1',
              alias: 'burnsPoolToken1'
            },
            {
              property: 'swapsPool.token0',
              alias: 'swapsPoolToken0'
            },
            {
              property: 'swapsPool.token1',
              alias: 'swapsPoolToken1'
            }
          ]
        );
      },

      uniswapDayDatas: async (_: any, { first, skip, orderBy, orderDirection, where }: { first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('uniswapDayDatas', first, skip, orderBy, orderDirection, where);

        return indexer.getEntities(UniswapDayData, {}, where, { limit: first, skip, orderBy, orderDirection });
      },

      positions: async (_: any, { first, where }: { first: number, where: { [key: string]: any } }) => {
        log('positions', first, where);

        return indexer.getEntities(
          Position,
          {},
          where,
          { limit: first },
          [
            'position.pool',
            'position.token0',
            'position.token1',
            'position.tickLower',
            'position.tickUpper',
            'position.transaction'
          ]
        );
      },

      blocks: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('blocks', first, orderBy, orderDirection, where);

        return indexer.getBlocks(where, { limit: first, orderBy, orderDirection });
      },

      indexingStatusForCurrentVersion: async (_: any, { subgraphName }: { subgraphName: string }) => {
        log('health', subgraphName);

        return indexer.getIndexingStatus();
      }
    }
  };
};
