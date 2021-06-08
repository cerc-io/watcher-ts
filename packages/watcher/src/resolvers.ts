import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { Indexer, ValueResult } from './indexer';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexer: Indexer): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    TokenEvent: {
      __resolveType: (obj: any) => {
        if (obj.owner) {
          return 'ApprovalEvent';
        }

        return 'TransferEvent';
      }
    },

    Query: {

      totalSupply: (_: any, { blockHash, token }: { blockHash: string, token: string }): Promise<ValueResult> => {
        log('totalSupply', blockHash, token);
        return indexer.totalSupply(blockHash, token);
      },

      balanceOf: async (_: any, { blockHash, token, owner }: { blockHash: string, token: string, owner: string }) => {
        log('balanceOf', blockHash, token, owner);
        return indexer.balanceOf(blockHash, token, owner);
      },

      allowance: async (_: any, { blockHash, token, owner, spender }: { blockHash: string, token: string, owner: string, spender: string }) => {
        log('allowance', blockHash, token, owner, spender);
        return indexer.allowance(blockHash, token, owner, spender);
      },

      name: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('name', blockHash, token);
        return indexer.name(blockHash, token);
      },

      symbol: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('symbol', blockHash, token);
        return indexer.symbol(blockHash, token);
      },

      decimals: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('decimals', blockHash, token);
        return indexer.decimals();
      },

      events: async (_: any, { blockHash, token, name }: { blockHash: string, token: string, name: string }) => {
        log('events', blockHash, token, name);
        return indexer.getEvents(blockHash, token, name);
      }
    }
  };
};
