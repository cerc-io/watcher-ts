//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import Decimal from 'decimal.js';
import { GraphQLScalarType } from 'graphql';

import { ValueResult, gqlTotalQueryCount, gqlQueryCount, getResultState, IndexerInterface, EventWatcher } from '@cerc-io/util';

import { Indexer } from './indexer';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexerArg: IndexerInterface, eventWatcher: EventWatcher): Promise<any> => {
  const indexer = indexerArg as Indexer;

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
      multiNonce: (_: any, { blockHash, contractAddress, key0, key1 }: { blockHash: string, contractAddress: string, key0: string, key1: bigint }): Promise<ValueResult> => {
        log('multiNonce', blockHash, contractAddress, key0, key1);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('multiNonce').inc(1);

        return indexer.multiNonce(blockHash, contractAddress, key0, key1);
      },

      _owner: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('_owner', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('_owner').inc(1);

        return indexer._owner(blockHash, contractAddress);
      },

      isRevoked: (_: any, { blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: string }): Promise<ValueResult> => {
        log('isRevoked', blockHash, contractAddress, key0);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('isRevoked').inc(1);

        return indexer.isRevoked(blockHash, contractAddress, key0);
      },

      isPhisher: (_: any, { blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: string }): Promise<ValueResult> => {
        log('isPhisher', blockHash, contractAddress, key0);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('isPhisher').inc(1);

        return indexer.isPhisher(blockHash, contractAddress, key0);
      },

      isMember: (_: any, { blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: string }): Promise<ValueResult> => {
        log('isMember', blockHash, contractAddress, key0);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('isMember').inc(1);

        return indexer.isMember(blockHash, contractAddress, key0);
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
      },

      latestBlock: async () => {
        log('latestBlock');
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('latestBlock').inc(1);

        return indexer.getLatestBlock();
      }
    }
  };
};
