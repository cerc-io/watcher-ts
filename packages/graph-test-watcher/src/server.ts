//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import 'reflect-metadata';
import express, { Application } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { WebSocketServer } from 'ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { useServer } from 'graphql-ws/lib/use/ws';
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import { PubSub } from 'graphql-subscriptions';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import 'graphql-import-node';
import { createServer } from 'http';

import { DEFAULT_CONFIG_PATH, getConfig, Config, JobQueue, KIND_ACTIVE, initClients } from '@cerc-io/util';
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

  const graphDb = new GraphDatabase(config.server, db.baseDatabase);
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
    // Delete jobs to prevent creating jobs after completion of processing previous block.
    await jobQueue.deleteAllJobs();
    await eventWatcher.start();
  }

  const resolvers = await createResolvers(indexer, eventWatcher);

  // Create an Express app and HTTP server
  const app: Application = express();
  const httpServer = createServer(app);

  // Create the schema
  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Create our WebSocket server using the HTTP server we just set up.
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql'
  });
  const serverCleanup = useServer({ schema }, wsServer);

  const server = new ApolloServer({
    schema,
    csrfPrevention: true,
    plugins: [
      // Proper shutdown for the HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Proper shutdown for the WebSocket server
      {
        async serverWillStart () {
          return {
            async drainServer () {
              await serverCleanup.dispose();
            }
          };
        }
      }
    ]
  });
  await server.start();
  server.applyMiddleware({ app });

  httpServer.listen(port, host, () => {
    log(`Server is listening on ${host}:${port}${server.graphqlPath}`);
  });

  return { app, server };
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
