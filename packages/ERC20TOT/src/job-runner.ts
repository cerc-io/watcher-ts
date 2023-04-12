//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';

import { JobRunnerCmd } from '@cerc-io/cli';
import { JobRunner } from '@cerc-io/util';

import { Indexer } from './indexer';
import { Database } from './database';

const log = debug('vulcanize:job-runner');

export const main = async (): Promise<any> => {
  const jobRunnerCmd = new JobRunnerCmd();
  await jobRunnerCmd.init(Database);

  await jobRunnerCmd.initIndexer(Indexer);

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
