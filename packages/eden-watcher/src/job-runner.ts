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
  JOB_KIND_PRUNE,
  JobQueueConfig,
  DEFAULT_CONFIG_PATH,
  initClients,
  startMetricsServer
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
      await this._baseJobRunner.processBlock(job);

      const { data: { kind } } = job;

      // If it's a pruning job: Create a hooks job.
      if (kind === JOB_KIND_PRUNE) {
        await this.createHooksJob();
      }

      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
      await this._baseJobRunner.processEvent(job);
    });
  }

  async subscribeHooksQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_HOOKS, async (job) => {
      const { data: { blockHash, blockNumber } } = job;

      // Get the current IPLD Status.
      const ipldStatus = await this._indexer.getIPLDStatus();

      if (ipldStatus) {
        if (ipldStatus.latestHooksBlockNumber < (blockNumber - 1)) {
          // Create hooks job for parent block.
          const [parentBlock] = await this._indexer.getBlocksAtHeight(blockNumber - 1, false);
          await this.createHooksJob(parentBlock.blockHash, parentBlock.blockNumber);

          const message = `Hooks for blockNumber ${blockNumber - 1} not processed yet, aborting`;
          log(message);

          throw new Error(message);
        }

        if (ipldStatus.latestHooksBlockNumber > (blockNumber - 1)) {
          log(`Hooks for blockNumber ${blockNumber} already processed`);

          return;
        }
      }

      // Process the hooks for the given block number.
      await this._indexer.processCanonicalBlock(blockHash);

      // Update the IPLD status.
      await this._indexer.updateIPLDStatusHooksBlock(blockNumber);

      // Create a checkpoint job after completion of a hook job.
      await this.createCheckpointJob(blockHash, blockNumber);

      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeBlockCheckpointQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_BLOCK_CHECKPOINT, async (job) => {
      const { data: { blockHash, blockNumber } } = job;

      // Get the current IPLD Status.
      const ipldStatus = await this._indexer.getIPLDStatus();
      assert(ipldStatus);

      if (ipldStatus.latestCheckpointBlockNumber >= 0) {
        if (ipldStatus.latestCheckpointBlockNumber < (blockNumber - 1)) {
          // Create a checkpoint job for parent block.
          const [parentBlock] = await this._indexer.getBlocksAtHeight(blockNumber - 1, false);
          await this.createCheckpointJob(parentBlock.blockHash, parentBlock.blockNumber);

          const message = `Checkpoints for blockNumber ${blockNumber - 1} not processed yet, aborting`;
          log(message);

          throw new Error(message);
        }

        if (ipldStatus.latestCheckpointBlockNumber > (blockNumber - 1)) {
          log(`Checkpoints for blockNumber ${blockNumber} already processed`);

          return;
        }
      }

      // Process checkpoints for the given block.
      await this._indexer.processCheckpoint(blockHash);

      // Update the IPLD status.
      await this._indexer.updateIPLDStatusCheckpointBlock(blockNumber);

      // Create an IPFS job after completion of a checkpoint job.
      if (this._indexer.isIPFSConfigured()) {
        await this.createIPFSPutJob(blockHash, blockNumber);
      }

      await this._jobQueue.markComplete(job);
    });
  }

  async subscribeIPFSQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_IPFS, async (job) => {
      const { data: { blockHash, blockNumber } } = job;

      const ipldStatus = await this._indexer.getIPLDStatus();
      assert(ipldStatus);

      if (ipldStatus.latestIPFSBlockNumber >= 0) {
        if (ipldStatus.latestIPFSBlockNumber < (blockNumber - 1)) {
          // Create a IPFS job for parent block.
          const [parentBlock] = await this._indexer.getBlocksAtHeight(blockNumber - 1, false);
          await this.createIPFSPutJob(parentBlock.blockHash, parentBlock.blockNumber);

          const message = `IPFS for blockNumber ${blockNumber - 1} not processed yet, aborting`;
          log(message);

          throw new Error(message);
        }

        if (ipldStatus.latestIPFSBlockNumber > (blockNumber - 1)) {
          log(`IPFS for blockNumber ${blockNumber} already processed`);

          return;
        }
      }

      // Get IPLDBlocks for the given blocHash.
      const ipldBlocks = await this._indexer.getIPLDBlocksByHash(blockHash);

      // Push all the IPLDBlocks to IPFS.
      for (const ipldBlock of ipldBlocks) {
        const data = this._indexer.getIPLDData(ipldBlock);
        await this._indexer.pushToIPFS(data);
      }

      // Update the IPLD status.
      await this._indexer.updateIPLDStatusIPFSBlock(blockNumber);

      await this._jobQueue.markComplete(job);
    });
  }

  async createHooksJob (blockHash?: string, blockNumber?: number): Promise<void> {
    if (!blockNumber || !blockHash) {
      // Get the latest canonical block
      const latestCanonicalBlock = await this._indexer.getLatestCanonicalBlock();

      // Create a hooks job for parent block of latestCanonicalBlock because pruning for first block is skipped as it is assumed to be a canonical block.
      blockHash = latestCanonicalBlock.parentHash;
      blockNumber = latestCanonicalBlock.blockNumber - 1;
    }

    await this._jobQueue.pushJob(
      QUEUE_HOOKS,
      {
        blockHash,
        blockNumber
      }
    );
  }

  async createCheckpointJob (blockHash: string, blockNumber: number): Promise<void> {
    await this._jobQueue.pushJob(
      QUEUE_BLOCK_CHECKPOINT,
      {
        blockHash,
        blockNumber
      }
    );
  }

  async createIPFSPutJob (blockHash: string, blockNumber: number): Promise<void> {
    await this._jobQueue.pushJob(
      QUEUE_IPFS,
      {
        blockHash,
        blockNumber
      }
    );
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

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, 'entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, ethClient, ethProvider, config.server);

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue, graphWatcher);
  await indexer.init();

  graphWatcher.setIndexer(indexer);
  await graphWatcher.init();

  // Watching all the contracts in the subgraph.
  await graphWatcher.addContracts();

  const jobRunner = new JobRunner(jobQueueConfig, indexer, jobQueue);
  await jobRunner.start();

  startMetricsServer(config.metrics);
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});
