//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
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
  QUEUE_IPFS,
  JobQueueConfig,
  DEFAULT_CONFIG_PATH,
  initClients,
  JOB_KIND_INDEX
} from '@vulcanize/util';
import { GraphWatcher, Database as GraphDatabase } from '@vulcanize/graph-node';

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
    await this.subscribeBlockProcessingQueue();
    await this.subscribeEventProcessingQueue();
    await this.subscribeBlockCheckpointQueue();
    await this.subscribeHooksQueue();
    await this.subscribeIPFSQueue();
  }

  async subscribeBlockProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
      // TODO Call pre-block hook here (Directly or indirectly (Like done through indexer.processEvent for events)).

      await this._baseJobRunner.processBlock(job);

      const { data: { kind, blockHash } } = job;

      if (kind === JOB_KIND_INDEX) {
        await this._indexer.processBlock(blockHash);
      }

      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
      const event = await this._baseJobRunner.processEvent(job);

      const watchedContract = await this._indexer.isWatchedContract(event.contract);
      if (watchedContract) {
        await this._indexer.processEvent(event);
      }

      await this._indexer.updateBlockProgress(event.block.blockHash, event.index);
      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeHooksQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_HOOKS, async (job) => {
      const { data: { blockNumber } } = job;

      const hookStatus = await this._indexer.getHookStatus();

      if (hookStatus && hookStatus.latestProcessedBlockNumber < (blockNumber - 1)) {
        const message = `Hooks for blockNumber ${blockNumber - 1} not processed yet, aborting`;
        log(message);

        throw new Error(message);
      }

      await this._indexer.processCanonicalBlock(job);

      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeBlockCheckpointQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_BLOCK_CHECKPOINT, async (job) => {
      await this._indexer.processCheckpoint(job);

      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeIPFSQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_IPFS, async (job) => {
      const { data: { data } } = job;

      await this._indexer.pushToIPFS(data);

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

  const config: Config = await getConfig(argv.f);
  const { ethClient, postgraphileClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, 'entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, postgraphileClient, ethProvider, config.server.subgraphPath);

  const indexer = new Indexer(config.server, db, ethClient, postgraphileClient, ethProvider, graphWatcher);

  graphWatcher.setIndexer(indexer);
  await graphWatcher.init();

  // Watching all the contracts in the subgraph.
  await graphWatcher.addContracts();

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const jobRunner = new JobRunner(jobQueueConfig, indexer, jobQueue);
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
