//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import Decimal from 'decimal.js';
import { GraphQLResolveInfo, GraphQLScalarType } from 'graphql';

import {
  ValueResult,
  BlockHeight,
  gqlTotalQueryCount,
  gqlQueryCount,
  jsonBigIntStringReplacer,
  getResultState,
  setGQLCacheHints,
  IndexerInterface,
  EventWatcher
} from '@cerc-io/util';

import { Indexer } from './indexer';

import { Author } from './entity/Author';
import { Blog } from './entity/Blog';
import { Category } from './entity/Category';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexerArg: IndexerInterface, eventWatcher: EventWatcher): Promise<any> => {
  const indexer = indexerArg as Indexer;

  const gqlCacheConfig = indexer.serverConfig.gqlCache;

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
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getMethod').inc(1);

        return indexer.getMethod(blockHash, contractAddress);
      },

      _test: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('_test', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('_test').inc(1);

        return indexer._test(blockHash, contractAddress);
      },

      blog: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('blog', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('blog').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Blog, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      category: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('category', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('category').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Category, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      author: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('author', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('author').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Author, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      events: async (_: any, { blockHash, contractAddress, name }: { blockHash: string, contractAddress: string, name?: string }) => {
        log('events', blockHash, contractAddress, name);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('events').inc(1);

        const block = await indexer.getBlockProgress(blockHash);
        if (!block || !block.isComplete) {
          throw new Error(`Block hash ${blockHash} number ${block?.blockNumber} not processed yet`);
        }

        const events = await indexer.getEventsByFilter(blockHash, contractAddress, name);
        return events.map(event => indexer.getResultEvent(event));
      },

      eventsInRange: async (_: any, { fromBlockNumber, toBlockNumber }: { fromBlockNumber: number, toBlockNumber: number }) => {
        log('eventsInRange', fromBlockNumber, toBlockNumber);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('eventsInRange').inc(1);

        const { expected, actual } = await indexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
        if (expected !== actual) {
          throw new Error(`Range not available, expected ${expected}, got ${actual} blocks in range`);
        }

        const events = await indexer.getEventsInRange(fromBlockNumber, toBlockNumber);
        return events.map(event => indexer.getResultEvent(event));
      },

      getStateByCID: async (_: any, { cid }: { cid: string }) => {
        log('getStateByCID', cid);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getStateByCID').inc(1);

        const state = await indexer.getStateByCID(cid);

        return state && state.block.isComplete ? getResultState(state) : undefined;
      },

      getState: async (_: any, { blockHash, contractAddress, kind }: { blockHash: string, contractAddress: string, kind: string }) => {
        log('getState', blockHash, contractAddress, kind);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getState').inc(1);

        const state = await indexer.getPrevState(blockHash, contractAddress, kind);

        return state && state.block.isComplete ? getResultState(state) : undefined;
      },

      getSyncStatus: async () => {
        log('getSyncStatus');
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getSyncStatus').inc(1);

        return indexer.getSyncStatus();
      }
    }
  };
};
