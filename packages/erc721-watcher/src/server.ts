//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import 'reflect-metadata';
import { PubSub } from 'graphql-subscriptions';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import 'graphql-import-node';

import { DEFAULT_CONFIG_PATH, getConfig, Config, JobQueue, KIND_ACTIVE, initClients, createAndStartServer } from '@cerc-io/util';

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { EventWatcher } from './events';

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
  const { ethClient, ethProvider } = await initClients(config);

  const { host, port, kind: watcherKind } = config.server;

  const db = new Database(config.database);
  await db.init();

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue);
  await indexer.init();

  const eventWatcher = new EventWatcher(config.upstream, ethClient, indexer, pubsub, jobQueue);

  if (watcherKind === KIND_ACTIVE) {
    await jobQueue.start();
    // Delete jobs to prevent creating jobs after completion of processing previous block.
    await jobQueue.deleteAllJobs();
    await eventWatcher.start();
  }

  const resolvers = await createResolvers(indexer, eventWatcher);
  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();

  createAndStartServer(typeDefs, resolvers, { host, port });
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});

process.on('SIGINT', () => {
  log(`Exiting process ${process.pid} with code 0`);
  process.exit(0);
});
