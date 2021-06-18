import assert from 'assert';
import debug from 'debug';

import { Indexer } from './indexer';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexer: Indexer): Promise<any> => {
  assert(indexer);

  return {
    Subscription: {
      onAddressEvent: {
        subscribe: () => indexer.getEventIterator()
      }
    },

    Mutation: {
      watchAddress: (_: any, { address, startingBlock = 1 }: { address: string, startingBlock: number }): Promise<boolean> => {
        log('watchAddress', address, startingBlock);
        return indexer.watchAddress(address, startingBlock);
      }
    },

    Query: {
      traceTx: async (_: any, { txHash }: { txHash: string }): Promise<any> => {
        log('traceTx', txHash);
        return indexer.traceTx(txHash);
      }
    }
  };
};
