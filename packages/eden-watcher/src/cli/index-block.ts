//
// Copyright 2022 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { IndexBlockCmd } from '@cerc-io/cli';
import { getGraphDbAndWatcher } from '@cerc-io/graph-node';

import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:index-block');

const main = async (): Promise<void> => {
  const indexBlockCmd = new IndexBlockCmd();
  await indexBlockCmd.init(Database);

  const { graphWatcher } = await getGraphDbAndWatcher(
    indexBlockCmd.config.server,
    indexBlockCmd.clients.ethClient,
    indexBlockCmd.ethProvider,
    indexBlockCmd.database.baseDatabase,
    ENTITY_QUERY_TYPE_MAP,
    ENTITY_TO_LATEST_ENTITY_MAP
  );

  await indexBlockCmd.initIndexer(Indexer, graphWatcher);

  await indexBlockCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
