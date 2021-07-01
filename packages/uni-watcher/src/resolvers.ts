import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { Indexer, ValueResult } from './indexer';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexer: Indexer): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    ERC20Event: {
      __resolveType() {
        return null;
      }
    },

    FactoryEvent: {
      __resolveType() {
        return null;
      }
    },

    NonFungiblePositionManagerEvent: {
      __resolveType() {
        return null;
      }
    },

    PoolEvent: {
      __resolveType() {
        return null;
      }
    },

    Event: {
      __resolveType() {
        return null;
      }
    },

    Subscription: {
      onEvent: {
        subscribe: () => indexer.getEventIterator()
      }
    },

    Query: {

      events: async (_: any, { blockHash, token, name }: { blockHash: string, token: string, name: string }) => {
        log('events', blockHash, token, name || '');
        return indexer.getEvents(blockHash, token, name);
      }
    }
  };
};
