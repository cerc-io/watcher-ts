import 'graphql-import-node';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLSchema } from 'graphql';

import * as typeDefs from './erc20.graphql';
import { createResolvers as createMockResolvers } from './mock/resolvers';
import { Config, createResolvers } from './resolvers';

export const createSchema = async (config: Config): Promise<GraphQLSchema> => {
  const resolvers = process.env.MOCK ? await createMockResolvers() : await createResolvers(config);

  return makeExecutableSchema({
    typeDefs,
    resolvers
  });
};
