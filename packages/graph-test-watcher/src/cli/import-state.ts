//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { ImportStateCmd } from '@cerc-io/cli';
import { getGraphDbAndWatcher } from '@cerc-io/graph-node';

import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from '../database';
import { Indexer } from '../indexer';
import { State } from '../entity/State';

const log = debug('vulcanize:import-state');

export const main = async (): Promise<any> => {
  const importStateCmd = new ImportStateCmd();
  await importStateCmd.init(Database);

  const { graphWatcher, graphDb } = await getGraphDbAndWatcher(
    importStateCmd.config.server,
    importStateCmd.clients.ethClient,
    importStateCmd.ethProvider,
    importStateCmd.database.baseDatabase,
    ENTITY_QUERY_TYPE_MAP,
    ENTITY_TO_LATEST_ENTITY_MAP
  );

  await importStateCmd.initIndexer(Indexer, graphWatcher);

  await importStateCmd.exec(State, graphDb);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
