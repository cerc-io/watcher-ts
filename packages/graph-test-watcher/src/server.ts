//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import 'reflect-metadata';
import debug from 'debug';

import { ServerCmd } from '@cerc-io/cli';
import { getGraphDbAndWatcher } from '@cerc-io/graph-node';

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from './database';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database);

  const { graphWatcher } = await getGraphDbAndWatcher(
    serverCmd.config.server,
    serverCmd.clients.ethClient,
    serverCmd.ethProvider,
    serverCmd.database.baseDatabase,
    ENTITY_QUERY_TYPE_MAP,
    ENTITY_TO_LATEST_ENTITY_MAP
  );

  await serverCmd.initIndexer(Indexer, graphWatcher);

  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
  return serverCmd.exec(createResolvers, typeDefs);
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
