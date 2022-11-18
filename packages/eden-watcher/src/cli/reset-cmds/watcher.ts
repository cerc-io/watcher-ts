//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import assert from 'assert';

import { getConfig, initClients, resetJobs, JobQueue, Config } from '@cerc-io/util';
import { GraphWatcher, Database as GraphDatabase } from '@cerc-io/graph-node';

import { Database, ENTITY_TO_LATEST_ENTITY_MAP } from '../../database';
import { Indexer } from '../../indexer';

const log = debug('vulcanize:reset-watcher');

export const command = 'watcher';

export const desc = 'Reset watcher to a block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const config: Config = await getConfig(argv.configFile);
  await resetJobs(config);
  const { ethClient, ethProvider } = await initClients(config);

  // Initialize database.
  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.server, db.baseDatabase, ENTITY_TO_LATEST_ENTITY_MAP);
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
  await indexer.resetLatestEntities(argv.blockNumber);
  log('Reset watcher successfully');
};
