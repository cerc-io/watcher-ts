//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import 'reflect-metadata';
import express, { Application } from 'express';
import { ApolloServer, PubSub } from 'apollo-server-express';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import 'graphql-import-node';
import { createServer } from 'http';

import { DEFAULT_CONFIG_PATH, getConfig, Config, JobQueue, KIND_ACTIVE, initClients, startGQLMetricsServer } from '@cerc-io/util';
import { GraphWatcher, Database as GraphDatabase } from '@cerc-io/graph-node';

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

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, 'entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, ethClient, ethProvider, config.server);

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue, graphWatcher);
  await indexer.init();

  graphWatcher.setIndexer(indexer);
  await graphWatcher.init();

  const eventWatcher = new EventWatcher(config.upstream, ethClient, indexer, pubsub, jobQueue);

  if (watcherKind === KIND_ACTIVE) {
    await jobQueue.start();
    await eventWatcher.start();
  }

  const resolvers = await createResolvers(indexer, eventWatcher);

  const app: Application = express();
  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
  const server = new ApolloServer({
    typeDefs,
    resolvers
  });

  await server.start();
  server.applyMiddleware({ app });

  const httpServer = createServer(app);
  server.installSubscriptionHandlers(httpServer);

  httpServer.listen(port, host, () => {
    log(`Server is listening on host ${host} port ${port}`);
  });

  startGQLMetricsServer(config);

  return { app, server };
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
