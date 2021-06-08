import 'graphql-import-node';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLSchema } from 'graphql';

import * as typeDefs from './erc20.graphql';
import { Indexer } from './indexer';
import { createResolvers as createMockResolvers } from './mock/resolvers';
import { createResolvers } from './resolvers';

export const createSchema = async (indexer: Indexer): Promise<GraphQLSchema> => {
  const resolvers = process.env.MOCK ? await createMockResolvers() : await createResolvers(indexer);

  return makeExecutableSchema({
    typeDefs,
    resolvers
  });
};
