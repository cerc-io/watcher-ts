import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { Indexer } from './indexer';
import { Burn } from './entity/Burn';
import { OrderDirection } from './database';

const log = debug('vulcanize:resolver');

const DEFAULT_LIMIT = 100;

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

      bundles: async (_: any, { block = {}, first = DEFAULT_LIMIT }: { first: number, block: BlockHeight }) => {
        log('bundles', block, first);

        return indexer.getBundles(block, { limit: first });
      },

      burns: async (_: any, { first = DEFAULT_LIMIT, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: Partial<Burn> }) => {
        log('burns', first, orderBy, orderDirection, where);

        return indexer.getBurns(where, { limit: first, orderBy, orderDirection });
      },

      factories: async (_: any, { block = {}, first = DEFAULT_LIMIT }: { first: number, block: BlockHeight }) => {
        log('factories', block, first);

        return indexer.getFactories(block, { limit: first });
      }
    }
  };
};
