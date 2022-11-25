//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { WatchContractCmd } from '@cerc-io/cli';
import { getGraphDbAndWatcher } from '@cerc-io/graph-node';

import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:watch-contract');

const main = async (): Promise<void> => {
  const watchContractCmd = new WatchContractCmd();
  await watchContractCmd.init(Database);

  const { graphWatcher } = await getGraphDbAndWatcher(
    watchContractCmd.config.server,
    watchContractCmd.clients.ethClient,
    watchContractCmd.ethProvider,
    watchContractCmd.database.baseDatabase,
    ENTITY_QUERY_TYPE_MAP,
    ENTITY_TO_LATEST_ENTITY_MAP
  );

  await watchContractCmd.initIndexer(Indexer, graphWatcher);

  await watchContractCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
