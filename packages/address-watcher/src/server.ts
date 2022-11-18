//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import express, { Application } from 'express';
import { PubSub } from 'graphql-subscriptions';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { getCache } from '@cerc-io/cache';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { TracingClient } from '@cerc-io/tracing-client';
import { getConfig, JobQueue, DEFAULT_CONFIG_PATH, createAndStartServer, Config } from '@cerc-io/util';

import typeDefs from './schema';

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { TxWatcher } from './tx-watcher';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv))
    .option('f', {
      alias: 'config-file',
      demandOption: true,
      describe: 'configuration file path (toml)',
      type: 'string',
      default: DEFAULT_CONFIG_PATH
    })
    .argv;

  const config: Config = await getConfig(argv.f);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { ethServer: { gqlApiEndpoint }, traceProviderEndpoint, cache: cacheConfig } = upstream;
  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(traceProviderEndpoint, 'Missing upstream traceProviderEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    cache
  });

  const tracingClient = new TracingClient(traceProviderEndpoint);

  const indexer = new Indexer(db, ethClient, tracingClient);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');
  assert(dbConnectionString, 'Missing job queue max completion lag time (seconds)');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();
  const txWatcher = new TxWatcher(ethClient, indexer, pubsub, jobQueue);
  await txWatcher.start();

  const resolvers = await createResolvers(indexer, txWatcher);

  // Create an Express app
  const app: Application = express();
  const server = createAndStartServer(app, typeDefs, resolvers, config.server);

  return { app, server };
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
