import assert from 'assert';
import debug from 'debug';

import { Indexer } from './indexer';

const log = debug('vulcanize:resolver');

interface WatchAddressParams {
  address: string,
  startingBlock: number
}

interface AppearanceParams {
  address: string,
  fromBlockNumber: number,
  toBlockNumber: number
}

export const createResolvers = async (indexer: Indexer): Promise<any> => {
  assert(indexer);

  return {
    Subscription: {
      onAddressEvent: {
        subscribe: () => indexer.getEventIterator()
      }
    },

    Mutation: {
      watchAddress: (_: any, { address, startingBlock = 1 }: WatchAddressParams): Promise<boolean> => {
        log('watchAddress', address, startingBlock);
        return indexer.watchAddress(address, startingBlock);
      }
    },

    Query: {
      appearances: async (_: any, { address, fromBlockNumber, toBlockNumber }: AppearanceParams): Promise<any> => {
        log('appearances', address, fromBlockNumber, toBlockNumber);
        return indexer.getAppearances(address, fromBlockNumber, toBlockNumber);
      },

      traceTx: async (_: any, { txHash }: { txHash: string }): Promise<any> => {
        log('traceTx', txHash);
        return indexer.traceTxAndIndexAppearances(txHash);
      }
    }
  };
};
