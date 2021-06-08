import assert from 'assert';
import 'reflect-metadata';
import express, { Application, Request, Response } from 'express';
import { graphqlHTTP } from 'express-graphql';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';

import artifacts from './artifacts/ERC20.json';
import { Indexer } from './indexer';
import { Database } from './database';
import { EventWatcher } from './events';
import { getConfig } from './config';
import { createSchema } from './gql';

const log = debug('vulcanize:server');

export const createServer = async (): Promise<Application> => {
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

  const { upstream, database: dbConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { gqlEndpoint, gqlSubscriptionEndpoint, cache: cacheConfig } = upstream;
  assert(gqlEndpoint, 'Missing upstream gqlEndpoint');
  assert(gqlSubscriptionEndpoint, 'Missing upstream gqlSubscriptionEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({ gqlEndpoint, gqlSubscriptionEndpoint, cache });

  const indexer = new Indexer(db, ethClient, artifacts);

  const eventWatcher = new EventWatcher(ethClient, indexer);
  await eventWatcher.start();

  const schema = await createSchema(indexer);

  const app: Application = express();

  app.use(
    '/graphql',
    graphqlHTTP({
      schema,
      graphiql: true
    })
  );

  app.get('/', (req: Request, res: Response) => {
    res.send('ERC20 Watcher');
  });

  app.listen(port, host, () => {
    log(`Server is listening on host ${host} port ${port}`);
  });

  return app;
};

createServer().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
