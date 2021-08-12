//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import BigInt from 'apollo-type-bigint';

import { blocks } from './data';

const log = debug('test');

export const createResolvers = async (): Promise<any> => {
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

      totalSupply: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('totalSupply', blockHash, token);

        return {
          value: blocks[blockHash][token].totalSupply,
          proof: { data: '' }
        };
      },

      balanceOf: (_: any, { blockHash, token, owner }: { blockHash: string, token: string, owner: string }) => {
        log('balanceOf', blockHash, token, owner);

        return {
          value: blocks[blockHash][token].balanceOf[owner],
          proof: { data: '' }
        };
      },

      allowance: (_: any, { blockHash, token, owner, spender }: { blockHash: string, token: string, owner: string, spender: string }) => {
        log('allowance', blockHash, token, owner, spender);

        return {
          value: blocks[blockHash][token].allowance[owner][spender],
          proof: { data: '' }
        };
      },

      name: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('name', blockHash, token);

        return {
          value: blocks[blockHash][token].name,
          proof: { data: '' }
        };
      },

      symbol: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('symbol', blockHash, token);

        return {
          value: blocks[blockHash][token].symbol,
          proof: { data: '' }
        };
      },

      decimals: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('decimals', blockHash, token);

        return {
          value: blocks[blockHash][token].decimals,
          proof: { data: '' }
        };
      },

      events: (_: any, { blockHash, token, name }: { blockHash: string, token: string, name: string }) => {
        log('events', blockHash, token, name);
        return blocks[blockHash][token].events
          .filter((e: any) => !name || name === e.name)
          .map((e: any) => ({ event: e }));
      }
    }
  };
};
