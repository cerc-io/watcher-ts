//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { ExportStateCmd } from '@cerc-io/cli';
import { getGraphDbAndWatcher } from '@cerc-io/graph-node';

import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:export-state');

const main = async (): Promise<void> => {
  const exportStateCmd = new ExportStateCmd();
  await exportStateCmd.init(Database);

  const { graphWatcher } = await getGraphDbAndWatcher(
    exportStateCmd.config.server,
    exportStateCmd.clients.ethClient,
    exportStateCmd.ethProvider,
    exportStateCmd.database.baseDatabase,
    ENTITY_QUERY_TYPE_MAP,
    ENTITY_TO_LATEST_ENTITY_MAP
  );

  await exportStateCmd.initIndexer(Indexer, graphWatcher);

  await exportStateCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
