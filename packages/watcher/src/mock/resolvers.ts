import debug from 'debug';
import BigInt from 'apollo-type-bigint';

import { blocks } from './data';

const log = debug('test');

export const createResolvers = async (config) => {

  return {
    BigInt: new BigInt('bigInt'),

    TokenEvent: {
      __resolveType: (obj) => {
        if (obj.owner) {
          return 'ApprovalEvent';
        }

        return 'TransferEvent';
      }
    },

    Query: {

      balanceOf: (_, { blockHash, token, owner }) => {
        log('balanceOf', blockHash, token, owner);

        return {
          value: blocks[blockHash][token].balanceOf[owner],
          proof: { data: '' }
        }
      },

      allowance: (_, { blockHash, token, owner, spender }) => {
        log('allowance', blockHash, token, owner, spender);

        return {
          value: blocks[blockHash][token].allowance[owner][spender],
          proof: { data: '' }
        }
      },

      events: (_, { blockHash, token, name }) => {
        log('events', blockHash, token, name);
        return blocks[blockHash][token].events
          .filter(e => !name || name === e.name)
          .map(e => ({ 'event': e }));
      }
    }
  };
};
