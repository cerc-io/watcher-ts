//
// Copyright 2021 Vulcanize, Inc.
//

import { ResetWatcherCmd } from '@cerc-io/cli';
import { getGraphDbAndWatcher } from '@cerc-io/graph-node';

import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from '../../database';
import { Indexer } from '../../indexer';

export const command = 'watcher';

export const desc = 'Reset watcher to a block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const resetWatcherCmd = new ResetWatcherCmd();
  await resetWatcherCmd.init(argv, Database);

  const { graphWatcher } = await getGraphDbAndWatcher(
    resetWatcherCmd.config.server,
    resetWatcherCmd.clients.ethClient,
    resetWatcherCmd.ethProvider,
    resetWatcherCmd.database.baseDatabase,
    ENTITY_QUERY_TYPE_MAP,
    ENTITY_TO_LATEST_ENTITY_MAP
  );

  await resetWatcherCmd.initIndexer(Indexer, graphWatcher);

  await resetWatcherCmd.exec();
};
