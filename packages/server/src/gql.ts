import 'graphql-import-node';
import { makeExecutableSchema } from '@graphql-tools/schema';

import * as typeDefs from './erc20.graphql';
import mockResolvers from './mock/resolvers';

// TODO: Create resolvers backed by erc20 watcher.
const resolvers = process.env.MOCK ? mockResolvers : {};

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers
});
