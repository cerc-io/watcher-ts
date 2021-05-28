import 'graphql-import-node';
import { makeExecutableSchema } from '@graphql-tools/schema';

import * as typeDefs from './erc20.graphql';
import { createResolvers as createMockResolvers } from './mock/resolvers';
import { createResolvers } from './resolvers';

export const createSchema = async (config) => {
  const resolvers = process.env.MOCK ? await createMockResolvers(config) : await createResolvers(config);

  return makeExecutableSchema({
    typeDefs,
    resolvers
  });
};
