//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';

import { Config, getConfig, fillBlocks, JobQueue, DEFAULT_CONFIG_PATH, initClients } from '@vulcanize/util';
import { GraphWatcher, Database as GraphDatabase } from '@vulcanize/graph-node';

import { Database } from './database';
import { Indexer } from './indexer';
import { EventWatcher } from './events';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
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
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, postgraphileClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, 'entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, postgraphileClient, ethProvider, config.server);

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, postgraphileClient, ethProvider, jobQueue, graphWatcher);
  await indexer.init();

  graphWatcher.setIndexer(indexer);
  await graphWatcher.init();

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();

  const eventWatcher = new EventWatcher(config.upstream, ethClient, postgraphileClient, indexer, pubsub, jobQueue);

  await fillBlocks(jobQueue, indexer, eventWatcher, config.upstream.ethServer.blockDelayInMilliSecs, argv);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});
