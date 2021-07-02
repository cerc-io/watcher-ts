import assert from 'assert';
import BigInt from 'apollo-type-bigint';

import { Indexer } from './indexer';

export const createResolvers = async (indexer: Indexer): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    Query: {}
  };
};
