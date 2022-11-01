//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import {
  getConfig,
  Config,
  JobQueue,
  JobRunner as BaseJobRunner,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  QUEUE_BLOCK_CHECKPOINT,
  QUEUE_HOOKS,
  JobQueueConfig,
  DEFAULT_CONFIG_PATH,
  initClients,
  startMetricsServer
} from '@cerc-io/util';

import { Indexer } from './indexer';
import { Database } from './database';

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: Indexer
  _jobQueue: JobQueue
  _baseJobRunner: BaseJobRunner
  _jobQueueConfig: JobQueueConfig

  constructor (jobQueueConfig: JobQueueConfig, indexer: Indexer, jobQueue: JobQueue) {
    this._jobQueueConfig = jobQueueConfig;
    this._indexer = indexer;
    this._jobQueue = jobQueue;
    this._baseJobRunner = new BaseJobRunner(this._jobQueueConfig, this._indexer, this._jobQueue);
  }

  async start (): Promise<void> {
    await this._jobQueue.deleteAllJobs();
    await this._baseJobRunner.resetToPrevIndexedBlock();
    await this.subscribeBlockProcessingQueue();
    await this.subscribeEventProcessingQueue();
    await this.subscribeBlockCheckpointQueue();
    await this.subscribeHooksQueue();
    this._baseJobRunner.handleShutdown();
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
      await this._baseJobRunner.processHooks(job);
    });
  }

  async subscribeBlockCheckpointQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_BLOCK_CHECKPOINT, async (job) => {
      await this._baseJobRunner.processCheckpoint(job);
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

  const config: Config = await getConfig(argv.f);
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, { ethClient }, ethProvider, jobQueue);
  await indexer.init();

  const jobRunner = new JobRunner(jobQueueConfig, indexer, jobQueue);
  await jobRunner.start();

  startMetricsServer(config, indexer);
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});
