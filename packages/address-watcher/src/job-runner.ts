//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { TracingClient } from '@vulcanize/tracing-client';
import { getConfig, JobQueue, DEFAULT_CONFIG_PATH } from '@vulcanize/util';

import { Indexer } from './indexer';
import { Database } from './database';
import { QUEUE_TX_TRACING } from './tx-watcher';

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

  const config = await getConfig(argv.f);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { ethServer: { gqlApiEndpoint, gqlPostgraphileEndpoint }, traceProviderEndpoint, cache: cacheConfig } = upstream;
  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint');
  assert(traceProviderEndpoint, 'Missing upstream traceProviderEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const tracingClient = new TracingClient(traceProviderEndpoint);

  const indexer = new Indexer(db, ethClient, tracingClient);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  await jobQueue.subscribe(QUEUE_TX_TRACING, async (job) => {
    const { data: { txHash } } = job;
    await indexer.traceTxAndIndexAppearances(txHash);
    await jobQueue.markComplete(job);
  });
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});
