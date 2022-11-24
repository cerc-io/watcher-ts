//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import 'graphql-import-node';

import { ServerCmd } from '@cerc-io/cli';

import typeDefs from './schema';
import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { EventWatcher } from './events';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database, Indexer, EventWatcher);

  return serverCmd.exec(createResolvers, typeDefs);
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
