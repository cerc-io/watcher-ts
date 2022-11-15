//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import { PubSub } from 'graphql-subscriptions';

import { Config, getConfig, fillBlocks, JobQueue, DEFAULT_CONFIG_PATH, initClients } from '@cerc-io/util';
import { GraphWatcher, Database as GraphDatabase } from '@cerc-io/graph-node';

import { Database } from './database';
import { Indexer } from './indexer';
import { EventWatcher } from './events';
import { fillState } from './fill-state';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).env(
    'FILL'
  ).options({
    configFile: {
      alias: 'f',
      type: 'string',
      demandOption: true,
      describe: 'configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
    },
    startBlock: {
      type: 'number',
      demandOption: true,
      describe: 'Block number to start processing at'
    },
    endBlock: {
      type: 'number',
      demandOption: true,
      describe: 'Block number to stop processing at'
    },
    prefetch: {
      type: 'boolean',
      default: false,
      describe: 'Block and events prefetch mode'
    },
    batchBlocks: {
      type: 'number',
      default: 10,
      describe: 'Number of blocks prefetched in batch'
    },
    state: {
      type: 'boolean',
      default: false,
      describe: 'Fill state for subgraph entities'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.server, db.baseDatabase);
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

  if (argv.state) {
    assert(config.server.enableState, 'State creation disabled');
    await fillState(indexer, graphDb, graphWatcher.dataSources, argv);

    return;
  }

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();

  const eventWatcher = new EventWatcher(config.upstream, ethClient, indexer, pubsub, jobQueue);

  await fillBlocks(jobQueue, indexer, eventWatcher, jobQueueConfig.blockDelayInMilliSecs, argv);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});
