//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import Decimal from 'decimal.js';
import { GraphQLResolveInfo, GraphQLScalarType } from 'graphql';

import { ValueResult, BlockHeight, gqlTotalQueryCount, gqlQueryCount, jsonBigIntStringReplacer, getResultState } from '@cerc-io/util';

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
      supportsInterface: (_: any, { blockHash, contractAddress, interfaceId }: { blockHash: string, contractAddress: string, interfaceId: string }): Promise<ValueResult> => {
        log('supportsInterface', blockHash, contractAddress, interfaceId);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('supportsInterface').inc(1);

        return indexer.supportsInterface(blockHash, contractAddress, interfaceId);
      },

      balanceOf: (_: any, { blockHash, contractAddress, owner }: { blockHash: string, contractAddress: string, owner: string }): Promise<ValueResult> => {
        log('balanceOf', blockHash, contractAddress, owner);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('balanceOf').inc(1);

        return indexer.balanceOf(blockHash, contractAddress, owner);
      },

      ownerOf: (_: any, { blockHash, contractAddress, tokenId }: { blockHash: string, contractAddress: string, tokenId: bigint }): Promise<ValueResult> => {
        log('ownerOf', blockHash, contractAddress, tokenId);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('ownerOf').inc(1);

        return indexer.ownerOf(blockHash, contractAddress, tokenId);
      },

      getApproved: (_: any, { blockHash, contractAddress, tokenId }: { blockHash: string, contractAddress: string, tokenId: bigint }): Promise<ValueResult> => {
        log('getApproved', blockHash, contractAddress, tokenId);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getApproved').inc(1);

        return indexer.getApproved(blockHash, contractAddress, tokenId);
      },

      isApprovedForAll: (_: any, { blockHash, contractAddress, owner, operator }: { blockHash: string, contractAddress: string, owner: string, operator: string }): Promise<ValueResult> => {
        log('isApprovedForAll', blockHash, contractAddress, owner, operator);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('isApprovedForAll').inc(1);

        return indexer.isApprovedForAll(blockHash, contractAddress, owner, operator);
      },

      name: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('name', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('name').inc(1);

        return indexer.name(blockHash, contractAddress);
      },

      symbol: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('symbol', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('symbol').inc(1);

        return indexer.symbol(blockHash, contractAddress);
      },

      tokenURI: (_: any, { blockHash, contractAddress, tokenId }: { blockHash: string, contractAddress: string, tokenId: bigint }): Promise<ValueResult> => {
        log('tokenURI', blockHash, contractAddress, tokenId);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tokenURI').inc(1);

        return indexer.tokenURI(blockHash, contractAddress, tokenId);
      },

      totalSupply: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('totalSupply', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('totalSupply').inc(1);

        return indexer.totalSupply(blockHash, contractAddress);
      },

      tokenOfOwnerByIndex: (_: any, { blockHash, contractAddress, owner, index }: { blockHash: string, contractAddress: string, owner: string, index: bigint }): Promise<ValueResult> => {
        log('tokenOfOwnerByIndex', blockHash, contractAddress, owner, index);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tokenOfOwnerByIndex').inc(1);

        return indexer.tokenOfOwnerByIndex(blockHash, contractAddress, owner, index);
      },

      tokenByIndex: (_: any, { blockHash, contractAddress, index }: { blockHash: string, contractAddress: string, index: bigint }): Promise<ValueResult> => {
        log('tokenByIndex', blockHash, contractAddress, index);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tokenByIndex').inc(1);

        return indexer.tokenByIndex(blockHash, contractAddress, index);
      },

      baseURI: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('baseURI', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('baseURI').inc(1);

        return indexer.baseURI(blockHash, contractAddress);
      },

      owner: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('owner', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('owner').inc(1);

        return indexer.owner(blockHash, contractAddress);
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
