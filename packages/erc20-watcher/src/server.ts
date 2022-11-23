//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import 'graphql-import-node';

import { ServerCmd } from '@cerc-io/cli';

import typeDefs from './schema';
import { createResolvers as createMockResolvers } from './mock/resolvers';
import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { EventWatcher } from './events';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database, Indexer, EventWatcher);

  return process.env.MOCK ? serverCmd.exec(createMockResolvers, typeDefs) : serverCmd.exec(createResolvers, typeDefs);
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
