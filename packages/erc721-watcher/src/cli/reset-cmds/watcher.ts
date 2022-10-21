//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import { MoreThan } from 'typeorm';
import assert from 'assert';

import { getConfig, initClients, resetJobs, JobQueue } from '@cerc-io/util';

import { Database } from '../../database';
import { Indexer } from '../../indexer';
import { BlockProgress } from '../../entity/BlockProgress';

import { SupportsInterface } from '../../entity/SupportsInterface';
import { BalanceOf } from '../../entity/BalanceOf';
import { OwnerOf } from '../../entity/OwnerOf';
import { GetApproved } from '../../entity/GetApproved';
import { IsApprovedForAll } from '../../entity/IsApprovedForAll';
import { Name } from '../../entity/Name';
import { Symbol } from '../../entity/Symbol';
import { TokenURI } from '../../entity/TokenURI';
import { _Name } from '../../entity/_Name';
import { _Symbol } from '../../entity/_Symbol';
import { _Owners } from '../../entity/_Owners';
import { _Balances } from '../../entity/_Balances';
import { _TokenApprovals } from '../../entity/_TokenApprovals';
import { _OperatorApprovals } from '../../entity/_OperatorApprovals';

const log = debug('vulcanize:reset-watcher');

export const command = 'watcher';

export const desc = 'Reset watcher to a block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const config = await getConfig(argv.configFile);
  await resetJobs(config);
  const { ethClient, ethProvider } = await initClients(config);

  // Initialize database.
  const db = new Database(config.database);
  await db.init();

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue);
  await indexer.init();

  await indexer.resetWatcherToBlock(argv.blockNumber);
  log('Reset watcher successfully');
};
