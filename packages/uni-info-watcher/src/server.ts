import assert from 'assert';
import 'reflect-metadata';
import express, { Application } from 'express';
import { ApolloServer } from 'apollo-server-express';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import 'graphql-import-node';
import { createServer } from 'http';

import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { getConfig, JobQueue } from '@vulcanize/util';
import { getCache } from '@vulcanize/cache';

import typeDefs from './schema';

import { createResolvers as createMockResolvers } from './mock/resolvers';
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
      type: 'string'
    })
    .argv;

  const config = await getConfig(argv.f);

  assert(config.server, 'Missing server config');

  const { host, port } = config.server;

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const {
    ethServer: {
      gqlApiEndpoint,
      gqlPostgraphileEndpoint
    },
    uniWatcher,
    tokenWatcher,
    cache: cacheConfig
  } = upstream;

  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);
  const indexer = new Indexer(db, uniClient, erc20Client, ethClient);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLag } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag });
  await jobQueue.start();

  const eventWatcher = new EventWatcher(indexer, ethClient, jobQueue);
  await eventWatcher.start();

  const resolvers = process.env.MOCK ? await createMockResolvers() : await createResolvers(indexer);

  const app: Application = express();
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

  return { app, server };
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});
