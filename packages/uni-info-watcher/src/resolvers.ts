//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { Indexer, OrderDirection, BlockHeight } from './indexer';
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

        return indexer.getEntities(Burn, {}, where, { limit: first, orderBy, orderDirection }, ['pool', 'transaction']);
      },

      factories: async (_: any, { block = {}, first }: { first: number, block: BlockHeight }) => {
        log('factories', block, first);

        return indexer.getEntities(Factory, block, {}, { limit: first });
      },

      mints: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('mints', first, orderBy, orderDirection, where);

        return indexer.getEntities(Mint, {}, where, { limit: first, orderBy, orderDirection }, ['pool', 'transaction']);
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

        return indexer.getEntities(Pool, block, where, { limit: first, orderBy, orderDirection }, ['token0', 'token1']);
      },

      swaps: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('swaps', first, orderBy, orderDirection, where);

        return indexer.getEntities(Swap, {}, where, { limit: first, orderBy, orderDirection }, ['pool', 'transaction']);
      },

      ticks: async (_: any, { block = {}, first, skip, where = {} }: { block: BlockHeight, first: number, skip: number, where: { [key: string]: any } }) => {
        log('ticks', block, first, skip, where);

        return indexer.getEntities(Tick, block, where, { limit: first, skip });
      },

      token: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('token', id, block);

        return indexer.getToken(id, block);
      },

      tokens: async (_: any, { orderBy, orderDirection, where }: { orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('tokens', orderBy, orderDirection, where);

        return indexer.getEntities(Token, {}, where, { orderBy, orderDirection });
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

        return indexer.getEntities(Transaction, {}, {}, { limit: first, orderBy, orderDirection }, ['burns', 'mints', 'swaps']);
      },

      uniswapDayDatas: async (_: any, { first, skip, orderBy, orderDirection, where }: { first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('uniswapDayDatas', first, skip, orderBy, orderDirection, where);

        return indexer.getEntities(UniswapDayData, {}, where, { limit: first, skip, orderBy, orderDirection });
      },

      positions: async (_: any, { first, where }: { first: number, where: { [key: string]: any } }) => {
        log('positions', first, where);

        return indexer.getEntities(Position, {}, where, { limit: first }, ['pool', 'token0', 'token1', 'tickLower', 'tickUpper', 'transaction']);
      },

      blocks: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('blocks', first, orderBy, orderDirection, where);

        return indexer.getBlocks(where, { limit: first, orderBy, orderDirection });
      }
    }
  };
};
