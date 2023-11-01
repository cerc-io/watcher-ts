//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { ethers } from 'ethers';
import { DeepPartial, In } from 'typeorm';
import PgBoss from 'pg-boss';

import { JobQueueConfig } from './config';
import {
  JOB_KIND_INDEX,
  JOB_KIND_PRUNE,
  JOB_KIND_EVENTS,
  JOB_KIND_CONTRACT,
  MAX_REORG_DEPTH,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  QUEUE_BLOCK_CHECKPOINT,
  QUEUE_HOOKS,
  QUEUE_HISTORICAL_PROCESSING
} from './constants';
import { JobQueue } from './job-queue';
import { BlockProgressInterface, EventInterface, IndexerInterface } from './types';
import { wait } from './misc';
import {
  createPruningJob,
  createHooksJob,
  createCheckpointJob,
  processBatchEvents,
  PrefetchedBlock,
  fetchBlocksAtHeight,
  fetchAndSaveFilteredLogsAndBlocks
} from './common';
import { lastBlockNumEvents, lastBlockProcessDuration, lastProcessedBlockNumber } from './metrics';

const log = debug('vulcanize:job-runner');

// Wait time for retrying events processing on error (in ms)
const EVENTS_PROCESSING_RETRY_WAIT = 2000;

// TODO: Get batch size from config
export const HISTORICAL_BLOCKS_BATCH_SIZE = 100;

export interface HistoricalJobData {
  blockNumber: number;
  processingEndBlockNumber: number;
}

export class JobRunner {
  jobQueue: JobQueue;
  _indexer: IndexerInterface;
  _jobQueueConfig: JobQueueConfig;
  _blockProcessStartTime?: Date;
  _endBlockProcessTimer?: () => void;
  // TODO: Check and remove events (always set to empty list as fetched from DB) from map structure
  _blockAndEventsMap: Map<string, PrefetchedBlock> = new Map();

  _shutDown = false;
  _signalCount = 0;

  constructor (jobQueueConfig: JobQueueConfig, indexer: IndexerInterface, jobQueue: JobQueue) {
    this._indexer = indexer;
    this.jobQueue = jobQueue;
    this._jobQueueConfig = jobQueueConfig;
  }

  async subscribeBlockProcessingQueue (): Promise<void> {
    await this.jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this.processBlock(job);
    });
  }

  async subscribeHistoricalProcessingQueue (): Promise<void> {
    await this.jobQueue.subscribe(QUEUE_HISTORICAL_PROCESSING, async (job) => {
      await this.processHistoricalBlocks(job);
    });
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this.jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
      await this.processEvent(job);
    });
  }

  async subscribeHooksQueue (): Promise<void> {
    await this.jobQueue.subscribe(QUEUE_HOOKS, async (job) => {
      await this.processHooks(job);
    });
  }

  async subscribeBlockCheckpointQueue (): Promise<void> {
    await this.jobQueue.subscribe(QUEUE_BLOCK_CHECKPOINT, async (job) => {
      await this.processCheckpoint(job);
    });
  }

  async processBlock (job: any): Promise<void> {
    const { data: { kind } } = job;

    switch (kind) {
      case JOB_KIND_INDEX: {
        const { data: { cid, blockHash, blockNumber, parentHash, timestamp } } = job;

        // Check if blockHash present in job.
        if (blockHash) {
          // If blockHash is present it is a job for indexing missing parent block.
          await this._indexBlock(job, {
            blockTimestamp: timestamp,
            cid,
            blockHash,
            blockNumber,
            parentHash
          });
        } else {
          // If blockHash is not present, it is a job to index the next consecutive blockNumber.
          const blocksToBeIndexed = await fetchBlocksAtHeight(
            blockNumber,
            this._indexer,
            this._jobQueueConfig,
            this._blockAndEventsMap
          );
          const indexBlockPromises = blocksToBeIndexed.map(blockToBeIndexed => this._indexBlock(job, blockToBeIndexed));
          await Promise.all(indexBlockPromises);
        }

        break;
      }

      case JOB_KIND_PRUNE: {
        await this._pruneChain(job);

        // Create a hooks job for parent block of latestCanonicalBlock pruning for first block is skipped as it is assumed to be a canonical block.
        const latestCanonicalBlock = await this._indexer.getLatestCanonicalBlock();

        // Check if latestCanonicalBlock is undefined incase of null block in FEVM
        if (latestCanonicalBlock) {
          await createHooksJob(this.jobQueue, latestCanonicalBlock.parentHash);
        }

        break;
      }

      default:
        log(`Invalid Job kind ${kind} in QUEUE_BLOCK_PROCESSING.`);
        break;
    }

    await this.jobQueue.markComplete(job);
  }

  async processHistoricalBlocks (job: PgBoss.JobWithDoneCallback<HistoricalJobData, HistoricalJobData>): Promise<void> {
    const { data: { blockNumber: startBlock, processingEndBlockNumber } } = job;
    const endBlock = Math.min(startBlock + HISTORICAL_BLOCKS_BATCH_SIZE, processingEndBlockNumber);
    log(`Processing historical blocks from ${startBlock} to ${endBlock}`);

    const blocks = await fetchAndSaveFilteredLogsAndBlocks(
      this._indexer,
      this._blockAndEventsMap,
      startBlock,
      endBlock
    );

    // Push event processing job for each block
    const pushJobForBlockPromises = blocks.map(async block => this.jobQueue.pushJob(
      QUEUE_EVENT_PROCESSING,
      {
        kind: JOB_KIND_EVENTS,
        blockHash: block.blockHash,
        publish: false
      }
    ));

    await Promise.all(pushJobForBlockPromises);
    await this.jobQueue.markComplete(job);
  }

  async processEvent (job: any): Promise<EventInterface | void> {
    const { data: { kind } } = job;

    switch (kind) {
      case JOB_KIND_EVENTS:
        await this._processEvents(job);
        break;

      case JOB_KIND_CONTRACT:
        this._updateWatchedContracts(job);
        break;

      default:
        log(`Invalid Job kind ${kind} in QUEUE_EVENT_PROCESSING.`);
        break;
    }

    await this.jobQueue.markComplete(job);
  }

  async processHooks (job: any): Promise<void> {
    // Get the block and current stateSyncStatus.
    const [blockProgress, stateSyncStatus] = await Promise.all([
      this._indexer.getBlockProgress(job.data.blockHash),
      this._indexer.getStateSyncStatus()
    ]);

    assert(blockProgress);
    const { blockHash, blockNumber, parentHash } = blockProgress;

    if (stateSyncStatus) {
      if (stateSyncStatus.latestIndexedBlockNumber < (blockNumber - 1)) {
        // Create hooks job for parent block.
        await createHooksJob(this.jobQueue, parentHash);

        const message = `State for blockNumber ${blockNumber - 1} not indexed yet, aborting`;
        log(message);

        throw new Error(message);
      }

      if (stateSyncStatus.latestIndexedBlockNumber > (blockNumber - 1)) {
        log(`State for blockNumber ${blockNumber} already indexed`);

        return;
      }
    }

    // Process the hooks for the given block number.
    await this._indexer.processCanonicalBlock(blockHash, blockNumber);

    // Update the stateSyncStatus.
    await this._indexer.updateStateSyncStatusIndexedBlock(blockNumber);

    // Create a checkpoint job after completion of a hooks job.
    await createCheckpointJob(this.jobQueue, blockHash, blockNumber);

    await this.jobQueue.markComplete(job);
  }

  async processCheckpoint (job: any): Promise<void> {
    const { data: { blockHash, blockNumber } } = job;

    // Get the current stateSyncStatus.
    const stateSyncStatus = await this._indexer.getStateSyncStatus();

    if (stateSyncStatus) {
      if (stateSyncStatus.latestCheckpointBlockNumber >= 0) {
        if (stateSyncStatus.latestCheckpointBlockNumber < (blockNumber - 1)) {
          // Create a checkpoint job for parent block.
          const [parentBlock] = await this._indexer.getBlocksAtHeight(blockNumber - 1, false);
          await createCheckpointJob(this.jobQueue, parentBlock.blockHash, parentBlock.blockNumber);

          const message = `Checkpoints for blockNumber ${blockNumber - 1} not processed yet, aborting`;
          log(message);

          throw new Error(message);
        }

        if (stateSyncStatus.latestCheckpointBlockNumber > (blockNumber - 1)) {
          log(`Checkpoints for blockNumber ${blockNumber} already processed`);

          return;
        }
      }

      // Process checkpoints for the given block.
      await this._indexer.processCheckpoint(blockHash);

      // Update the stateSyncStatus.
      await this._indexer.updateStateSyncStatusCheckpointBlock(blockNumber);
    }

    await this.jobQueue.markComplete(job);
  }

  async resetToPrevIndexedBlock (): Promise<void> {
    const syncStatus = await this._indexer.getSyncStatus();

    // Watcher running for first time if syncStatus does not exist
    if (!syncStatus) {
      return;
    }

    const blockProgress = await this._indexer.getBlockProgress(syncStatus.latestIndexedBlockHash);
    assert(blockProgress);

    // Don't reset to previous block if block is complete (all events processed)
    if (blockProgress.isComplete) {
      return;
    }

    // Resetting to block before latest indexed block as all events should be processed in the previous block.
    // Reprocessing of events in subgraph watchers is not possible as DB transaction is not implemented.
    await this._indexer.resetWatcherToBlock(syncStatus.latestIndexedBlockNumber - 1);
  }

  handleShutdown (): void {
    process.on('SIGINT', this._processShutdown.bind(this));
    process.on('SIGTERM', this._processShutdown.bind(this));
  }

  async _processShutdown (): Promise<void> {
    this._shutDown = true;
    this._signalCount++;

    if (this._signalCount >= 3 || process.env.YARN_CHILD_PROCESS === 'true') {
      // Forceful exit on receiving signal for the 3rd time or if job-runner is a child process of yarn.
      log('Forceful shutdown');
      this.jobQueue.stop();
      process.exit(1);
    }
  }

  async _pruneChain (job: any): Promise<void> {
    console.time('time:job-runner#_pruneChain');

    const syncStatus = await this._indexer.getSyncStatus();
    assert(syncStatus);

    const { pruneBlockHeight } = job.data;

    log(`Processing chain pruning at ${pruneBlockHeight}`);

    // Assert we're at a depth where pruning is safe.
    assert(syncStatus.latestIndexedBlockNumber >= (pruneBlockHeight + MAX_REORG_DEPTH));

    // Check that we haven't already pruned at this depth.
    if (syncStatus.latestCanonicalBlockNumber >= pruneBlockHeight) {
      log(`Already pruned at block height ${pruneBlockHeight}, latestCanonicalBlockNumber ${syncStatus.latestCanonicalBlockNumber}`);
    } else {
      // Check how many branches there are at the given height/block number.
      const blocksAtHeight = await this._indexer.getBlocksAtHeight(pruneBlockHeight, false);

      let newCanonicalBlockHash = ethers.constants.HashZero;

      // Prune only if blocks exist at pruneBlockHeight
      // There might be missing null block in FEVM; only update the sync status in such case
      if (blocksAtHeight.length !== 0) {
        // We have more than one node at this height, so prune all nodes not reachable from indexed block at max reorg depth from prune height.
        // This will lead to orphaned nodes, which will get pruned at the next height.
        if (blocksAtHeight.length > 1) {
          const [indexedBlock] = await this._indexer.getBlocksAtHeight(pruneBlockHeight + MAX_REORG_DEPTH, false);

          // Get ancestor blockHash from indexed block at prune height.
          const ancestorBlockHash = await this._indexer.getAncestorAtDepth(indexedBlock.blockHash, MAX_REORG_DEPTH);
          newCanonicalBlockHash = ancestorBlockHash;

          const blocksToBePruned = blocksAtHeight.filter(block => ancestorBlockHash !== block.blockHash);

          if (blocksToBePruned.length) {
            // Mark blocks pruned which are not the ancestor block.
            await this._indexer.markBlocksAsPruned(blocksToBePruned);
          }
        } else {
          newCanonicalBlockHash = blocksAtHeight[0].blockHash;
        }
      }

      // Update the canonical block in the SyncStatus.
      await this._indexer.updateSyncStatusCanonicalBlock(newCanonicalBlockHash, pruneBlockHeight);
    }

    console.timeEnd('time:job-runner#_pruneChain');
  }

  async _indexBlock (job: any, blockToBeIndexed: DeepPartial<BlockProgressInterface>): Promise<void> {
    const syncStatus = await this._indexer.getSyncStatus();
    assert(syncStatus);

    const { data: { priority } } = job;
    const { cid, blockHash, blockNumber, parentHash, blockTimestamp } = blockToBeIndexed;
    assert(blockNumber);
    assert(blockHash);
    assert(parentHash);

    const indexBlockStartTime = new Date();

    // Log time taken to complete processing of previous block.
    if (this._blockProcessStartTime) {
      const blockProcessDuration = indexBlockStartTime.getTime() - this._blockProcessStartTime.getTime();
      log(`time:job-runner#_indexBlock-process-block-${blockNumber - 1}: ${blockProcessDuration}ms`);
      log(`Total block process time (${blockNumber - 1}): ${blockProcessDuration}ms`);
    }

    this._blockProcessStartTime = indexBlockStartTime;
    log(`Processing block number ${blockNumber} hash ${blockHash} `);

    // Check if chain pruning is caught up.
    if ((syncStatus.latestIndexedBlockNumber - syncStatus.latestCanonicalBlockNumber) > MAX_REORG_DEPTH) {
      await createPruningJob(this.jobQueue, syncStatus.latestCanonicalBlockNumber, priority);

      const message = `Chain pruning not caught up yet, latest canonical block number ${syncStatus.latestCanonicalBlockNumber} and latest indexed block number ${syncStatus.latestIndexedBlockNumber}`;
      log(message);
      throw new Error(message);
    }

    console.time('time:job-runner#_indexBlock-get-block-progress-entities');
    let [parentBlock, blockProgress] = await this._indexer.getBlockProgressEntities(
      {
        blockHash: In([parentHash, blockHash])
      },
      {
        order: {
          blockNumber: 'ASC'
        }
      }
    );
    console.timeEnd('time:job-runner#_indexBlock-get-block-progress-entities');

    // Check if parent block has been processed yet, if not, push a high priority job to process that first and abort.
    // However, don't go beyond the `latestCanonicalBlockNumber` from SyncStatus as we have to assume the reorg can't be that deep.
    // latestCanonicalBlockNumber is used to handle null blocks in case of FEVM.
    if (blockNumber > syncStatus.latestCanonicalBlockNumber) {
      // Create a higher priority job to index parent block and then abort.
      // We don't have to worry about aborting as this job will get retried later.
      const newPriority = (priority || 0) + 1;

      if (!parentBlock || parentBlock.blockHash !== parentHash) {
        const blocks = await this._indexer.getBlocks({ blockHash: parentHash });

        if (!blocks.length) {
          const message = `No blocks at parentHash ${parentHash}, aborting`;
          log(message);

          throw new Error(message);
        }

        const [{ cid: parentCid, blockNumber: parentBlockNumber, parentHash: grandparentHash, timestamp: parentTimestamp }] = blocks;

        await this.jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
          kind: JOB_KIND_INDEX,
          cid: parentCid,
          blockHash: parentHash,
          blockNumber: Number(parentBlockNumber),
          parentHash: grandparentHash,
          timestamp: Number(parentTimestamp),
          priority: newPriority
        }, { priority: newPriority });

        const message = `Parent block number ${parentBlockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash} not fetched yet, aborting`;
        log(message);

        // Do not throw error and complete the job as block will be processed after parent block processing.
        return;
      }

      if (!parentBlock.isComplete) {
        // Parent block indexing needs to finish before this block can be indexed.
        const message = `Indexing incomplete for parent block number ${parentBlock.blockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash}, aborting`;
        log(message);

        await this.jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
          kind: JOB_KIND_INDEX,
          cid: parentBlock.cid,
          blockHash: parentHash,
          blockNumber: parentBlock.blockNumber,
          parentHash: parentBlock.parentHash,
          timestamp: parentBlock.blockTimestamp,
          priority: newPriority
        }, { priority: newPriority });

        // Do not throw error and complete the job as block will be processed after parent block processing.
        return;
      } else {
        // Remove the unknown events of the parent block if it is marked complete.
        console.time('time:job-runner#_indexBlock-remove-unknown-events');
        await this._indexer.removeUnknownEvents(parentBlock);
        console.timeEnd('time:job-runner#_indexBlock-remove-unknown-events');
      }
    }

    if (!blockProgress) {
      const prefetchedBlock = this._blockAndEventsMap.get(blockHash);

      if (prefetchedBlock) {
        ({ block: blockProgress } = prefetchedBlock);
      } else {
        // Delay required to process block.
        const { jobDelayInMilliSecs = 0 } = this._jobQueueConfig;
        await wait(jobDelayInMilliSecs);

        console.time('time:job-runner#_indexBlock-saveBlockAndFetchEvents');
        log(`_indexBlock#saveBlockAndFetchEvents: fetching from upstream server ${blockHash}`);
        [blockProgress] = await this._indexer.saveBlockAndFetchEvents({ cid, blockHash, blockNumber, parentHash, blockTimestamp });
        log(`_indexBlock#saveBlockAndFetchEvents: fetched for block: ${blockProgress.blockHash} num events: ${blockProgress.numEvents}`);
        console.timeEnd('time:job-runner#_indexBlock-saveBlockAndFetchEvents');

        this._blockAndEventsMap.set(blockHash, { block: blockProgress, events: [] });
      }
    }

    if (!blockProgress.isComplete) {
      await this._indexer.processBlock(blockProgress);
    }

    // Push job to event processing queue.
    // Block with all events processed or no events will not be processed again due to check in _processEvents.
    await this.jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { kind: JOB_KIND_EVENTS, blockHash: blockProgress.blockHash, publish: true });

    const indexBlockDuration = new Date().getTime() - indexBlockStartTime.getTime();
    log(`time:job-runner#_indexBlock: ${indexBlockDuration}ms`);
  }

  async _processEvents (job: any): Promise<void> {
    const { blockHash } = job.data;

    try {
      if (!this._blockAndEventsMap.has(blockHash)) {
        console.time('time:job-runner#_processEvents-get-block-progress');
        const block = await this._indexer.getBlockProgress(blockHash);
        console.timeEnd('time:job-runner#_processEvents-get-block-progress');

        assert(block);
        this._blockAndEventsMap.set(blockHash, { block, events: [] });
      }

      const prefetchedBlock = this._blockAndEventsMap.get(blockHash);
      assert(prefetchedBlock);

      const { block } = prefetchedBlock;

      console.time('time:job-runner#_processEvents-events');
      await processBatchEvents(this._indexer, block, this._jobQueueConfig.eventsInBatch, this._jobQueueConfig.subgraphEventsOrder);
      console.timeEnd('time:job-runner#_processEvents-events');

      // Update metrics
      lastProcessedBlockNumber.set(block.blockNumber);
      lastBlockNumEvents.set(block.numEvents);

      this._blockAndEventsMap.delete(block.blockHash);

      if (this._endBlockProcessTimer) {
        this._endBlockProcessTimer();
      }

      this._endBlockProcessTimer = lastBlockProcessDuration.startTimer();

      if (this._shutDown) {
        log(`Graceful shutdown after processing block ${block.blockNumber}`);
        this.jobQueue.stop();
        process.exit(0);
      }
    } catch (error) {
      log(`Error in processing events for block ${blockHash}`);
      log(error);

      // TODO: Remove processed entities for current block to avoid reprocessing of events

      // Catch event processing error and push to job queue after some time with higher priority
      log(`Retrying event processing after ${EVENTS_PROCESSING_RETRY_WAIT} ms`);
      await wait(EVENTS_PROCESSING_RETRY_WAIT);
      await this.jobQueue.pushJob(
        QUEUE_EVENT_PROCESSING,
        job.data,
        {
          priority: 1
        }
      );
    }
  }

  _updateWatchedContracts (job: any): void {
    const { data: { contract } } = job;
    this._indexer.cacheContract(contract);
    this._indexer.updateStateStatusMap(contract.address, {});
  }
}
