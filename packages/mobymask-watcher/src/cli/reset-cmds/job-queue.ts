//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';

import { getConfig, resetJobs } from '@vulcanize/util';

const log = debug('vulcanize:reset-job-queue');

export const command = 'job-queue';

export const desc = 'Reset job queue';

export const builder = {};

export const handler = async (argv: any): Promise<void> => {
  const config = await getConfig(argv.configFile);
  await resetJobs(config);

  log('Job queue reset successfully');
};
