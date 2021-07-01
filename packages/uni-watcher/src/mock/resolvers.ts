import debug from 'debug';
import BigInt from 'apollo-type-bigint';

import { blocks } from './data';

const log = debug('test');

export const createResolvers = async (): Promise<any> => {
  return {
    BigInt: new BigInt('bigInt'),

    TokenEvent: {
      __resolveType: (obj: any) => {
        // TODO: Return correct type.
        return obj.__typename;
      }
    },

    Query: {

      events: (_: any, { blockHash, token, name }: { blockHash: string, token: string, name: string }) => {
        log('events', blockHash, token, name);
        return blocks[blockHash][token].events
          .filter((e: any) => !name || name === e.name)
          .map((e: any) => ({ event: e }));
      }
    }
  };
};
