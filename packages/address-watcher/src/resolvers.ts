//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import { withFilter } from 'graphql-subscriptions';
import { ethers } from 'ethers';

import { Indexer } from './indexer';
import { TxWatcher } from './tx-watcher';

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

export const createResolvers = async (indexer: Indexer, txWatcher: TxWatcher): Promise<any> => {
  return {
    Subscription: {
      onAddressEvent: {
        subscribe: withFilter(
          () => txWatcher.getAddressEventIterator(),
          (payload: any, variables: any) => {
            return payload.onAddressEvent.address === ethers.utils.getAddress(variables.address);
          }
        )
      },

      onBlockProgressEvent: {
        subscribe: () => txWatcher.getBlockProgressEventIterator()
      }
    },

    Mutation: {
      watchAddress: (_: any, { address, startingBlock = 1 }: WatchAddressParams): Promise<boolean> => {
        address = ethers.utils.getAddress(address);

        log('watchAddress', address, startingBlock);
        return indexer.watchAddress(address, startingBlock);
      }
    },

    Query: {
      appearances: async (_: any, { address, fromBlockNumber, toBlockNumber }: AppearanceParams): Promise<any> => {
        address = ethers.utils.getAddress(address);

        log('appearances', address, fromBlockNumber, toBlockNumber);
        return indexer.getAppearances(address, fromBlockNumber, toBlockNumber);
      },

      traceTx: async (_: any, { txHash }: { txHash: string }): Promise<any> => {
        log('traceTx', txHash);

        const { blockHash, blockNumber, trace } = await indexer.traceTxAndIndexAppearances(txHash);

        return {
          txHash,
          blockNumber,
          blockHash,
          trace
        };
      }
    }
  };
};
