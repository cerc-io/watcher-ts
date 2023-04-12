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
      totalSupply: (
        _: any,
        { blockHash, contractAddress }: { blockHash: string, contractAddress: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('totalSupply', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('totalSupply').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer.totalSupply(blockHash, contractAddress);
      },

      balanceOf: (
        _: any,
        { blockHash, contractAddress, account }: { blockHash: string, contractAddress: string, account: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('balanceOf', blockHash, contractAddress, account);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('balanceOf').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer.balanceOf(blockHash, contractAddress, account);
      },

      allowance: (
        _: any,
        { blockHash, contractAddress, owner, spender }: { blockHash: string, contractAddress: string, owner: string, spender: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('allowance', blockHash, contractAddress, owner, spender);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('allowance').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer.allowance(blockHash, contractAddress, owner, spender);
      },

      name: (
        _: any,
        { blockHash, contractAddress }: { blockHash: string, contractAddress: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('name', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('name').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer.name(blockHash, contractAddress);
      },

      symbol: (
        _: any,
        { blockHash, contractAddress }: { blockHash: string, contractAddress: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('symbol', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('symbol').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer.symbol(blockHash, contractAddress);
      },

      decimals: (
        _: any,
        { blockHash, contractAddress }: { blockHash: string, contractAddress: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('decimals', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('decimals').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer.decimals(blockHash, contractAddress);
      },

      _balances: (
        _: any,
        { blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('_balances', blockHash, contractAddress, key0);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('_balances').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer._balances(blockHash, contractAddress, key0);
      },

      _allowances: (
        _: any,
        { blockHash, contractAddress, key0, key1 }: { blockHash: string, contractAddress: string, key0: string, key1: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('_allowances', blockHash, contractAddress, key0, key1);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('_allowances').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer._allowances(blockHash, contractAddress, key0, key1);
      },

      _totalSupply: (
        _: any,
        { blockHash, contractAddress }: { blockHash: string, contractAddress: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('_totalSupply', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('_totalSupply').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer._totalSupply(blockHash, contractAddress);
      },

      _name: (
        _: any,
        { blockHash, contractAddress }: { blockHash: string, contractAddress: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('_name', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('_name').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer._name(blockHash, contractAddress);
      },

      _symbol: (
        _: any,
        { blockHash, contractAddress }: { blockHash: string, contractAddress: string },
        __: any,
        info: GraphQLResolveInfo
      ): Promise<ValueResult> => {
        log('_symbol', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('_symbol').inc(1);

        // Set cache-control hints
        // setGQLCacheHints(info, {}, gqlCacheConfig);

        return indexer._symbol(blockHash, contractAddress);
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
