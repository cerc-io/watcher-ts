//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import Decimal from 'decimal.js';
import { GraphQLScalarType } from 'graphql';

import { ValueResult, BlockHeight, getResultState, IndexerInterface, EventWatcher } from '@cerc-io/util';

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
      supportsInterface: (_: any, { blockHash, contractAddress, interfaceId }: { blockHash: string, contractAddress: string, interfaceId: string }): Promise<ValueResult> => {
        log('supportsInterface', blockHash, contractAddress, interfaceId);
        return indexer.supportsInterface(blockHash, contractAddress, interfaceId);
      },

      balanceOf: (_: any, { blockHash, contractAddress, owner }: { blockHash: string, contractAddress: string, owner: string }): Promise<ValueResult> => {
        log('balanceOf', blockHash, contractAddress, owner);
        return indexer.balanceOf(blockHash, contractAddress, owner);
      },

      ownerOf: (_: any, { blockHash, contractAddress, tokenId }: { blockHash: string, contractAddress: string, tokenId: bigint }): Promise<ValueResult> => {
        log('ownerOf', blockHash, contractAddress, tokenId);
        return indexer.ownerOf(blockHash, contractAddress, tokenId);
      },

      getApproved: (_: any, { blockHash, contractAddress, tokenId }: { blockHash: string, contractAddress: string, tokenId: bigint }): Promise<ValueResult> => {
        log('getApproved', blockHash, contractAddress, tokenId);
        return indexer.getApproved(blockHash, contractAddress, tokenId);
      },

      isApprovedForAll: (_: any, { blockHash, contractAddress, owner, operator }: { blockHash: string, contractAddress: string, owner: string, operator: string }): Promise<ValueResult> => {
        log('isApprovedForAll', blockHash, contractAddress, owner, operator);
        return indexer.isApprovedForAll(blockHash, contractAddress, owner, operator);
      },

      name: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('name', blockHash, contractAddress);
        return indexer.name(blockHash, contractAddress);
      },

      symbol: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('symbol', blockHash, contractAddress);
        return indexer.symbol(blockHash, contractAddress);
      },

      tokenURI: (_: any, { blockHash, contractAddress, tokenId }: { blockHash: string, contractAddress: string, tokenId: bigint }): Promise<ValueResult> => {
        log('tokenURI', blockHash, contractAddress, tokenId);
        return indexer.tokenURI(blockHash, contractAddress, tokenId);
      },

      _name: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('_name', blockHash, contractAddress);
        return indexer._name(blockHash, contractAddress);
      },

      _symbol: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('_symbol', blockHash, contractAddress);
        return indexer._symbol(blockHash, contractAddress);
      },

      _owners: (_: any, { blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: bigint }): Promise<ValueResult> => {
        log('_owners', blockHash, contractAddress, key0);
        return indexer._owners(blockHash, contractAddress, key0);
      },

      _balances: (_: any, { blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: string }): Promise<ValueResult> => {
        log('_balances', blockHash, contractAddress, key0);
        return indexer._balances(blockHash, contractAddress, key0);
      },

      _tokenApprovals: (_: any, { blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: bigint }): Promise<ValueResult> => {
        log('_tokenApprovals', blockHash, contractAddress, key0);
        return indexer._tokenApprovals(blockHash, contractAddress, key0);
      },

      _operatorApprovals: (_: any, { blockHash, contractAddress, key0, key1 }: { blockHash: string, contractAddress: string, key0: string, key1: string }): Promise<ValueResult> => {
        log('_operatorApprovals', blockHash, contractAddress, key0, key1);
        return indexer._operatorApprovals(blockHash, contractAddress, key0, key1);
      },

      transferCount: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('transferCount', id, block);

        return indexer.getTransferCount(id, block);
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

        const state = await indexer.getStateByCID(cid);

        return state && state.block.isComplete ? getResultState(state) : undefined;
      },

      getState: async (_: any, { blockHash, contractAddress, kind }: { blockHash: string, contractAddress: string, kind: string }) => {
        log('getState', blockHash, contractAddress, kind);

        const state = await indexer.getPrevState(blockHash, contractAddress, kind);

        return state && state.block.isComplete ? getResultState(state) : undefined;
      },

      getSyncStatus: async () => {
        log('getSyncStatus');

        return indexer.getSyncStatus();
      }
    }
  };
};
