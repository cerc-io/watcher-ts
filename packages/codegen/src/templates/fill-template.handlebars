//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';

import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { getConfig, fillBlocks, JobQueue, DEFAULT_CONFIG_PATH, getCustomProvider } from '@vulcanize/util';

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
    }
  }).argv;

  const config = await getConfig(argv.configFile);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { ethServer: { gqlPostgraphileEndpoint, rpcProviderEndpoint }, cache: cacheConfig } = upstream;
  assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({
    gqlEndpoint: gqlPostgraphileEndpoint,
    gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const postgraphileClient = new EthClient({
    gqlEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();
  const indexer = new Indexer(db, ethClient, postgraphileClient, ethProvider);

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const eventWatcher = new EventWatcher(ethClient, indexer, pubsub, jobQueue);

  assert(jobQueueConfig, 'Missing job queue config');

  await fillBlocks(jobQueue, indexer, ethClient, eventWatcher, argv);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});
