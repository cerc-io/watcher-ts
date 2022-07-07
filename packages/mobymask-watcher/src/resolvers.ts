//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import Decimal from 'decimal.js';
import { GraphQLScalarType } from 'graphql';

import { ValueResult, BlockHeight, StateKind } from '@vulcanize/util';

import { Indexer } from './indexer';
import { EventWatcher } from './events';

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
      domainHash: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('domainHash', blockHash, contractAddress);
        return indexer.domainHash(blockHash, contractAddress);
      },

      multiNonce: (_: any, { blockHash, contractAddress, key0, key1 }: { blockHash: string, contractAddress: string, key0: string, key1: bigint }): Promise<ValueResult> => {
        log('multiNonce', blockHash, contractAddress, key0, key1);
        return indexer.multiNonce(blockHash, contractAddress, key0, key1);
      },

      _owner: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('_owner', blockHash, contractAddress);
        return indexer._owner(blockHash, contractAddress);
      },

      isRevoked: (_: any, { blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: string }): Promise<ValueResult> => {
        log('isRevoked', blockHash, contractAddress, key0);
        return indexer.isRevoked(blockHash, contractAddress, key0);
      },

      isPhisher: (_: any, { blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: string }): Promise<ValueResult> => {
        log('isPhisher', blockHash, contractAddress, key0);
        return indexer.isPhisher(blockHash, contractAddress, key0);
      },

      isMember: (_: any, { blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: string }): Promise<ValueResult> => {
        log('isMember', blockHash, contractAddress, key0);
        return indexer.isMember(blockHash, contractAddress, key0);
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

        const events = await indexer.getEventsInRange(fromBlockNumber, toBlockNumber);
        return events.map(event => indexer.getResultEvent(event));
      },

      getStateByCID: async (_: any, { cid }: { cid: string }) => {
        log('getStateByCID', cid);

        const ipldBlock = await indexer.getIPLDBlockByCid(cid);

        return ipldBlock && ipldBlock.block.isComplete ? indexer.getResultIPLDBlock(ipldBlock) : undefined;
      },

      getState: async (_: any, { blockHash, contractAddress, kind = StateKind.Diff }: { blockHash: string, contractAddress: string, kind: string }) => {
        log('getState', blockHash, contractAddress, kind);

        const ipldBlock = await indexer.getPrevIPLDBlock(blockHash, contractAddress, kind);

        return ipldBlock && ipldBlock.block.isComplete ? indexer.getResultIPLDBlock(ipldBlock) : undefined;
      },

      latestBlock: async () => {
        log('latestBlock');

        return indexer.getLatestBlock();
      }
    }
  };
};
