//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { InspectCIDCmd } from '@cerc-io/cli';
import { getGraphDbAndWatcher } from '@cerc-io/graph-node';

import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:inspect-cid');

const main = async (): Promise<void> => {
  const inspectCIDCmd = new InspectCIDCmd();
  await inspectCIDCmd.init(Database);

  const { graphWatcher } = await getGraphDbAndWatcher(
    inspectCIDCmd.config.server,
    inspectCIDCmd.clients.ethClient,
    inspectCIDCmd.ethProvider,
    inspectCIDCmd.database.baseDatabase,
    ENTITY_QUERY_TYPE_MAP,
    ENTITY_TO_LATEST_ENTITY_MAP
  );

  await inspectCIDCmd.initIndexer(Indexer, graphWatcher);

  await inspectCIDCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
