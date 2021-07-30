import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { Indexer, OrderDirection } from './indexer';
import { Burn } from './entity/Burn';
import { Bundle } from './entity/Bundle';
import { Factory } from './entity/Factory';
import { Mint } from './entity/Mint';
import { PoolDayData } from './entity/PoolDayData';
import { Pool } from './entity/Pool';
import { Swap } from './entity/Swap';

const log = debug('vulcanize:resolver');

export interface BlockHeight {
  number?: number;
  hash?: string;
}

export const createResolvers = async (indexer: Indexer): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    Query: {
      bundle: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('bundle', id, block);

        return indexer.getBundle(id, block);
      },

      bundles: async (_: any, { block = {}, first }: { first: number, block: BlockHeight }) => {
        log('bundles', block, first);

        return indexer.getEntities(Bundle, { blockHash: block.hash, blockNumber: block.number }, { limit: first });
      },

      burns: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: Partial<Burn> }) => {
        log('burns', first, orderBy, orderDirection, where);

        return indexer.getEntities(Burn, where, { limit: first, orderBy, orderDirection }, ['pool', 'transaction']);
      },

      factories: async (_: any, { block = {}, first }: { first: number, block: BlockHeight }) => {
        log('factories', block, first);

        return indexer.getEntities(Factory, { blockHash: block.hash, blockNumber: block.number }, { limit: first });
      },

      mints: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: Partial<Burn> }) => {
        log('burns', first, orderBy, orderDirection, where);

        return indexer.getEntities(Mint, where, { limit: first, orderBy, orderDirection }, ['pool', 'transaction']);
      },

      pool: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('bundle', id, block);

        return indexer.getPool(id, block);
      },

      poolDayDatas: async (_: any, { first, skip, orderBy, orderDirection, where }: { first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: Partial<Burn> }) => {
        log('poolDayDatas', first, skip, orderBy, orderDirection, where);

        return indexer.getEntities(PoolDayData, where, { limit: first, skip, orderBy, orderDirection });
      },

      pools: async (_: any, { block = {}, first, orderBy, orderDirection, where = {} }: { block: BlockHeight, first: number, orderBy: string, orderDirection: OrderDirection, where: Partial<Burn> }) => {
        log('burns', block, first, orderBy, orderDirection, where);
        where.blockHash = block.hash;
        where.blockNumber = block.number;

        return indexer.getEntities(Pool, where, { limit: first, orderBy, orderDirection }, ['token0', 'token1']);
      },

      swaps: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: Partial<Burn> }) => {
        log('swaps', first, orderBy, orderDirection, where);

        return indexer.getEntities(Swap, where, { limit: first, orderBy, orderDirection }, ['pool', 'transaction']);
      }
    }
  };
};
