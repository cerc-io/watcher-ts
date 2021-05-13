import BigInt from 'apollo-type-bigint';

import { blocks } from './data';

const resolvers = {
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
      console.log('balanceOf', blockHash, token, owner);

      return {
        value: blocks[blockHash][token].balanceOf[owner],
        proof: { data: '' }
      }
    },

    allowance: (_, { blockHash, token, owner, spender }) => {
      console.log('allowance', blockHash, token, owner, spender);

      return {
        value: blocks[blockHash][token].allowance[owner][spender],
        proof: { data: '' }
      }
    },

    events: (_, { blockHash, token, name }) => {
      console.log('events', blockHash, token, name);
      return blocks[blockHash][token].events
        .filter(e => !name || name === e.name)
        .map(e => ({ 'event': e }));
    }
  }
};

export default resolvers;
