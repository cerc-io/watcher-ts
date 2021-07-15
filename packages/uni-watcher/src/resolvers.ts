import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { Indexer } from './indexer';
import { EventWatcher } from './events';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexer: Indexer, eventWatcher: EventWatcher): Promise<any> => {
  return {
    BigInt: new BigInt('bigInt'),

    ERC20Event: {
      __resolveType () {
        return null;
      }
    },

    FactoryEvent: {
      __resolveType () {
        return null;
      }
    },

    NonFungiblePositionManagerEvent: {
      __resolveType () {
        return null;
      }
    },

    PoolEvent: {
      __resolveType () {
        return null;
      }
    },

    Event: {
      __resolveType: (obj: any) => {
        assert(obj.__typename);

        return obj.__typename;
      }
    },

    Subscription: {
      onEvent: {
        subscribe: () => eventWatcher.getEventIterator()
      },

      onBlockProgressEvent: {
        subscribe: () => eventWatcher.getBlockProgressEventIterator()
      }
    },

    Query: {

      events: async (_: any, { blockHash, contract, name }: { blockHash: string, contract: string, name: string }) => {
        log('events', blockHash, contract, name || '');

        const blockProgress = await indexer.getBlockProgress(blockHash);
        if (!blockProgress || !blockProgress.isComplete) {
          // TODO: Trigger indexing for the block.
          throw new Error('Not available');
        }

        const events = await indexer.getEventsByFilter(blockHash, contract, name);
        return events.map(event => indexer.getResultEvent(event));
      },

      eventsInRange: async (_: any, { fromBlockNumber, toBlockNumber }: { fromBlockNumber: number, toBlockNumber: number }) => {
        log('eventsInRange', fromBlockNumber, toBlockNumber);

        const { expected, actual } = await indexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
        if (expected !== actual) {
          throw new Error(`Range not available, expected ${expected}, got ${actual} blocks in range`);
        }

        const events = await indexer.getEventsInRange(fromBlockNumber, toBlockNumber);
        return events.map(event => indexer.getResultEvent(event));
      }
    }
  };
};
