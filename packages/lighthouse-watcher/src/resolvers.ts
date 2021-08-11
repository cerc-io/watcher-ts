import BigInt from 'apollo-type-bigint';
import assert from 'assert';

import { EventWatcher } from './events';

export const createResolvers = async (eventWatcher: EventWatcher): Promise<any> => {
  return {
    BigInt: new BigInt('bigInt'),

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
    }
  };
};
