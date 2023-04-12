//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import 'reflect-metadata';
import debug from 'debug';

import { ServerCmd } from '@cerc-io/cli';

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database);

  await serverCmd.initIndexer(Indexer);

  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();

  return serverCmd.exec(createResolvers, typeDefs);
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
