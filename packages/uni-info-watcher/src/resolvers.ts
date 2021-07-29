import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { Indexer } from './indexer';

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

      bundles: async (_: any, { first, block = {} }: { first: string, block: BlockHeight }) => {
        log('bundles', first, block);

        return indexer.getBundles(first, block);
      }
    }
  };
};
