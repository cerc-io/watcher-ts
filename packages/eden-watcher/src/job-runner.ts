//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';

import { JobRunnerCmd } from '@cerc-io/cli';
import { JobRunner } from '@cerc-io/util';
import { getGraphDbAndWatcher } from '@cerc-io/graph-node';

import { Indexer } from './indexer';
import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from './database';

const log = debug('vulcanize:job-runner');

export const main = async (): Promise<any> => {
  const jobRunnerCmd = new JobRunnerCmd();
  await jobRunnerCmd.init(Database);

  const { graphWatcher } = await getGraphDbAndWatcher(
    jobRunnerCmd.config.server,
    jobRunnerCmd.clients.ethClient,
    jobRunnerCmd.ethProvider,
    jobRunnerCmd.database.baseDatabase,
    ENTITY_QUERY_TYPE_MAP,
    ENTITY_TO_LATEST_ENTITY_MAP
  );

  await jobRunnerCmd.initIndexer(Indexer, graphWatcher);

  await jobRunnerCmd.exec(async (jobRunner: JobRunner): Promise<void> => {
    await jobRunner.subscribeBlockProcessingQueue();
    await jobRunner.subscribeEventProcessingQueue();
    await jobRunner.subscribeBlockCheckpointQueue();
    await jobRunner.subscribeHooksQueue();
  });
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});
