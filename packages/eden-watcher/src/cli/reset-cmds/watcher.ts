//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import debug from 'debug';
import { MoreThan } from 'typeorm';
import assert from 'assert';

import { getConfig, initClients, resetJobs, JobQueue } from '@cerc-io/util';
import { GraphWatcher, Database as GraphDatabase } from '@cerc-io/graph-node';

import { Database } from '../../database';
import { Indexer } from '../../indexer';
import { BlockProgress } from '../../entity/BlockProgress';
import { Producer } from '../../entity/Producer';
import { ProducerSet } from '../../entity/ProducerSet';
import { ProducerSetChange } from '../../entity/ProducerSetChange';
import { ProducerRewardCollectorChange } from '../../entity/ProducerRewardCollectorChange';
import { RewardScheduleEntry } from '../../entity/RewardScheduleEntry';
import { RewardSchedule } from '../../entity/RewardSchedule';
import { ProducerEpoch } from '../../entity/ProducerEpoch';
import { Block } from '../../entity/Block';
import { Epoch } from '../../entity/Epoch';
import { SlotClaim } from '../../entity/SlotClaim';
import { Slot } from '../../entity/Slot';
import { Staker } from '../../entity/Staker';
import { Network } from '../../entity/Network';
import { Distributor } from '../../entity/Distributor';
import { Distribution } from '../../entity/Distribution';
import { Claim } from '../../entity/Claim';
import { Slash } from '../../entity/Slash';
import { Account } from '../../entity/Account';

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

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, '../../entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, ethClient, ethProvider, config.server);

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue, graphWatcher);
  await indexer.init();

  graphWatcher.setIndexer(indexer);
  await graphWatcher.init();

  await indexer.resetWatcherToBlock(argv.blockNumber);
  log('Reset watcher successfully');
};
