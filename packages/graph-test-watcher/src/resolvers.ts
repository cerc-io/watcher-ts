//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { ValueResult } from '@vulcanize/util';

import { Indexer } from './indexer';
import { EventWatcher } from './events';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexer: Indexer, eventWatcher: EventWatcher): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    Event: {
      __resolveType: (obj: any) => {
        assert(obj.__typename);

        return obj.__typename;
      }
    },

    Subscription: {
      onEvent: {
        subscribe: () => eventWatcher.getEventIterator()
      }
    },

    Mutation: {
      watchContract: (_: any, { contractAddress, startingBlock = 1 }: { contractAddress: string, startingBlock: number }): Promise<boolean> => {
        log('watchContract', contractAddress, startingBlock);
        return indexer.watchContract(contractAddress, startingBlock);
      }
    },

    Query: {
      getMethod: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('getMethod', blockHash, contractAddress);
        return indexer.getMethod(blockHash, contractAddress);
      },

      _test: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('_test', blockHash, contractAddress);
        return indexer._test(blockHash, contractAddress);
      },

      events: async (_: any, { blockHash, contractAddress, name }: { blockHash: string, contractAddress: string, name: string }) => {
        log('events', blockHash, contractAddress, name || '');

        const block = await indexer.getBlockProgress(blockHash);
        if (!block || !block.isComplete) {
          throw new Error(`Block hash ${blockHash} number ${block?.blockNumber} not processed yet`);
        }

        const events = await indexer.getEventsByFilter(blockHash, contractAddress, name);
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
      },

      exampleEntity: async (_: any, { blockHash, id }: { blockHash: string, id: string }) => {
        log('exampleEntity', blockHash, id);

        const exampleEntity = await indexer.getExampleEntity(blockHash, id);

        return JSON.stringify(exampleEntity, undefined, 2);
      }
    }
  };
};
