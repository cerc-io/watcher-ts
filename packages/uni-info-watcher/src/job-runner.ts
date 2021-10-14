//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import {
  getConfig,
  JobQueue,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  QUEUE_HOOKS,
  JobRunner as BaseJobRunner,
  JobQueueConfig,
  DEFAULT_CONFIG_PATH,
  getCustomProvider,
  ServerConfig
} from '@vulcanize/util';

import { Indexer } from './indexer';
import { Database } from './database';

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: Indexer
  _jobQueue: JobQueue
  _baseJobRunner: BaseJobRunner
  _jobQueueConfig: JobQueueConfig
  _serverConfig: ServerConfig

  constructor (jobQueueConfig: JobQueueConfig, serverConfig: ServerConfig, indexer: Indexer, jobQueue: JobQueue) {
    this._jobQueueConfig = jobQueueConfig;
    this._indexer = indexer;
    this._jobQueue = jobQueue;
    this._serverConfig = serverConfig;
    this._baseJobRunner = new BaseJobRunner(this._jobQueueConfig, this._serverConfig, this._indexer, this._jobQueue);
  }

  async start (): Promise<void> {
    await this.subscribeBlockProcessingQueue();
    await this.subscribeEventProcessingQueue();
    await this.subscribeHooksQueue();
  }

  async subscribeBlockProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this._baseJobRunner.processBlock(job);
    });
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
      await this._baseJobRunner.processEvent(job);
    });
  }

  async subscribeHooksQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_HOOKS, async (job) => {
      await this._indexer.processBlock(job);

      await this._jobQueue.markComplete(job);
    });
  }
}

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

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig, server: serverConfig } = config;

  assert(upstream, 'Missing upstream config');
  assert(dbConfig, 'Missing database config');
  assert(serverConfig, 'Missing server config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');

  const {
    uniWatcher: {
      gqlEndpoint,
      gqlSubscriptionEndpoint
    },
    tokenWatcher,
    cache: cacheConfig,
    ethServer: {
      gqlApiEndpoint,
      gqlPostgraphileEndpoint,
      rpcProviderEndpoint
    }
  } = upstream;

  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(gqlEndpoint, 'Missing upstream uniWatcher.gqlEndpoint');
  assert(gqlSubscriptionEndpoint, 'Missing upstream uniWatcher.gqlSubscriptionEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const postgraphileClient = new EthClient({
    gqlEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const uniClient = new UniClient({
    gqlEndpoint,
    gqlSubscriptionEndpoint
  });

  const erc20Client = new ERC20Client(tokenWatcher);
  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(db, uniClient, erc20Client, ethClient, postgraphileClient, ethProvider, jobQueue, serverConfig.mode);

  const jobRunner = new JobRunner(jobQueueConfig, serverConfig, indexer, jobQueue);
  await jobRunner.start();
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});

process.on('SIGINT', () => {
  log(`Exiting process ${process.pid} with code 0`);
  process.exit(0);
});
