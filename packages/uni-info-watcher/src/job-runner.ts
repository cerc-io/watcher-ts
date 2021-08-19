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
import { getConfig, JobQueue, QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING, QUEUE_CHAIN_PRUNING, JobRunner as BaseJobRunner } from '@vulcanize/util';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';

import { Indexer } from './indexer';
import { Database } from './database';

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: Indexer
  _jobQueue: JobQueue
  _baseJobRunner: BaseJobRunner

  constructor (indexer: Indexer, jobQueue: JobQueue) {
    this._indexer = indexer;
    this._jobQueue = jobQueue;
    this._baseJobRunner = new BaseJobRunner(this._indexer, this._jobQueue);
  }

  async start (): Promise<void> {
    await this.subscribeBlockProcessingQueue();
    await this.subscribeEventProcessingQueue();
    await this.subscribeChainPruningQueue();
  }

  async subscribeBlockProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this._baseJobRunner.processBlock(job);

      const { data: { blockHash, blockNumber, parentHash, timestamp } } = job;

      // Check if block is being already processed.
      // TODO: Debug issue block getting processed twice without this check. Can reproduce with NFPM.mint().
      const blockProgress = await this._indexer.getBlockProgress(blockHash);

      if (!blockProgress) {
        const events = await this._indexer.getOrFetchBlockEvents({ blockHash, blockNumber, parentHash, blockTimestamp: timestamp });

        for (let ei = 0; ei < events.length; ei++) {
          await this._jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { id: events[ei].id, publish: true });
        }
      }

      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
      const event = await this._baseJobRunner.processEvent(job);

      // Check if event is processed.
      if (!event.block.isComplete && event.index !== event.block.lastProcessedEventIndex) {
        await this._indexer.processEvent(event);
      }

      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeChainPruningQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_CHAIN_PRUNING, async (job) => {
      await this._baseJobRunner.pruneChain(job);

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
      type: 'string'
    })
    .argv;

  const config = await getConfig(argv.f);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { uniWatcher: { gqlEndpoint, gqlSubscriptionEndpoint }, tokenWatcher, cache: cacheConfig, ethServer: { gqlApiEndpoint, gqlPostgraphileEndpoint } } = upstream;
  assert(gqlEndpoint, 'Missing upstream uniWatcher.gqlEndpoint');
  assert(gqlSubscriptionEndpoint, 'Missing upstream uniWatcher.gqlSubscriptionEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const uniClient = new UniClient({
    gqlEndpoint,
    gqlSubscriptionEndpoint
  });

  const erc20Client = new ERC20Client(tokenWatcher);

  const indexer = new Indexer(db, uniClient, erc20Client, ethClient, config);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLag, jobDelay } = jobQueueConfig;
  assert(jobDelay, 'Missing job delay time');
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag });
  await jobQueue.start();

  const jobRunner = new JobRunner(indexer, jobQueue);
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
