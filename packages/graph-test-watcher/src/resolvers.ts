//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import Decimal from 'decimal.js';
import { GraphQLScalarType } from 'graphql';

import { ValueResult, BlockHeight, StateKind, jsonBigIntStringReplacer } from '@cerc-io/util';

import { Indexer } from './indexer';
import { EventWatcher } from './events';

import { Author } from './entity/Author';
import { Blog } from './entity/Blog';
import { Category } from './entity/Category';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexer: Indexer, eventWatcher: EventWatcher): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    BigDecimal: new GraphQLScalarType({
      name: 'BigDecimal',
      description: 'BigDecimal custom scalar type',
      parseValue (value) {
        // value from the client
        return new Decimal(value);
      },
      serialize (value: Decimal) {
        // value sent to the client
        return value.toFixed();
      }
    }),

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
      watchContract: async (_: any, { address, kind, checkpoint, startingBlock = 1 }: { address: string, kind: string, checkpoint: boolean, startingBlock: number }): Promise<boolean> => {
        log('watchContract', address, kind, checkpoint, startingBlock);
        await indexer.watchContract(address, kind, checkpoint, startingBlock);

        return true;
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

      blog: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }): Promise<Blog | undefined> => {
        log('blog', id, JSON.stringify(block, jsonBigIntStringReplacer));

        return indexer.getSubgraphEntity(Blog, id, block);
      },

      category: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }): Promise<Category | undefined> => {
        log('category', id, JSON.stringify(block, jsonBigIntStringReplacer));

        return indexer.getSubgraphEntity(Category, id, block);
      },

      author: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }): Promise<Author | undefined> => {
        log('author', id, JSON.stringify(block, jsonBigIntStringReplacer));

        return indexer.getSubgraphEntity(Author, id, block);
      },

      events: async (_: any, { blockHash, contractAddress, name }: { blockHash: string, contractAddress: string, name?: string }) => {
        log('events', blockHash, contractAddress, name);

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

      getStateByCID: async (_: any, { cid }: { cid: string }) => {
        log('getStateByCID', cid);

        const ipldBlock = await indexer.getIPLDBlockByCid(cid);

        return ipldBlock && ipldBlock.block.isComplete ? indexer.getResultIPLDBlock(ipldBlock) : undefined;
      },

      getState: async (_: any, { blockHash, contractAddress, kind = StateKind.Checkpoint }: { blockHash: string, contractAddress: string, kind: string }) => {
        log('getState', blockHash, contractAddress, kind);

        const ipldBlock = await indexer.getPrevIPLDBlock(blockHash, contractAddress, kind);

        return ipldBlock && ipldBlock.block.isComplete ? indexer.getResultIPLDBlock(ipldBlock) : undefined;
      },

      getSyncStatus: async () => {
        log('getSyncStatus');

        return indexer.getSyncStatus();
      }
    }
  };
};
