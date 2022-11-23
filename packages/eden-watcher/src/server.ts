//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import 'reflect-metadata';
import debug from 'debug';
import 'graphql-import-node';

import { ServerCmd } from '@cerc-io/cli';

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from './database';
import { EventWatcher } from './events';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database, Indexer, EventWatcher, {}, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP);

  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();

  return serverCmd.exec(createResolvers, typeDefs);
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
