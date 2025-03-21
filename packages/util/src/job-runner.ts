//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { constants, ethers, errors as ethersErrors } from 'ethers';
import { DeepPartial, In } from 'typeorm';
import PgBoss from 'pg-boss';

import { JobQueueConfig } from './config';
import {
  JOB_KIND_INDEX,
  JOB_KIND_PRUNE,
  MAX_REORG_DEPTH,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  QUEUE_BLOCK_CHECKPOINT,
  QUEUE_HOOKS,
  QUEUE_HISTORICAL_PROCESSING
} from './constants';
import { JobQueue } from './job-queue';
import { BlockProgressInterface, ContractJobData, EventsJobData, EventsQueueJobKind, IndexerInterface } from './types';
import { wait } from './misc';
import {
  createPruningJob,
  createHooksJob,
  createCheckpointJob,
  processBatchEvents,
  PrefetchedBlock,
  fetchBlocksAtHeight,
  fetchAndSaveFilteredLogsAndBlocks,
  NEW_BLOCK_MAX_RETRIES_ERROR
} from './common';
import { isSyncingHistoricalBlocks, lastBlockNumEvents, lastBlockProcessDuration, lastProcessedBlockNumber } from './metrics';

const log = debug('vulcanize:job-runner');

const DEFAULT_HISTORICAL_LOGS_BLOCK_RANGE = 2000;

export interface HistoricalJobData {
  blockNumber: number;
  processingEndBlockNumber: number;
}

export interface HistoricalJobResponseData {
  isComplete: boolean;
  endBlock?: number;
}

export class JobRunner {
  jobQueue: JobQueue;
  _indexer: IndexerInterface;
  _jobQueueConfig: JobQueueConfig;
  _blockProcessStartTime?: Date;
  _endBlockProcessTimer?: () => void;
  _historicalProcessingCompletedUpto?: number;

  // TODO: Check and remove events (always set to empty list as fetched from DB) from map structure
  _blockAndEventsMap: Map<string, PrefetchedBlock> = new Map();
  _lastHistoricalProcessingEndBlockNumber = 0;

  _shutDown = false;
  _signalCount = 0;
  _errorInEventsProcessing = false;

  constructor (
    jobQueueConfig: JobQueueConfig,
    indexer: IndexerInterface,
    jobQueue: JobQueue
  ) {
    this._indexer = indexer;
    this.jobQueue = jobQueue;
    this._jobQueueConfig = jobQueueConfig;
  }

  async subscribeBlockProcessingQueue (): Promise<void> {
    await this.jobQueue.subscribe(
      QUEUE_BLOCK_PROCESSING,
      async (job) => {
        try {
          await this.processBlock(job);
        } catch (error) {
          this._jobErrorHandler(error as Error);
          throw error;
        }
      }
    );
  }

  async subscribeHistoricalProcessingQueue (): Promise<void> {
    await this.jobQueue.subscribe(
      QUEUE_HISTORICAL_PROCESSING,
      async (job) => {
        try {
          await this.processHistoricalBlocks(job);
        } catch (error) {
          this._jobErrorHandler(error as Error);
          throw error;
        }
      },
      {
        teamSize: 1
      }
    );
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this.jobQueue.subscribe(
      QUEUE_EVENT_PROCESSING,
      async (job) => {
        try {
          await this.processEvent(job as PgBoss.JobWithMetadataDoneCallback<EventsJobData | ContractJobData, object>);
        } catch (error) {
          this._jobErrorHandler(error as Error);
          throw error;
        }
      },
      {
        teamSize: 1,
        includeMetadata: true
      }
    );
  }

  async subscribeHooksQueue (): Promise<void> {
    await this.jobQueue.subscribe(
      QUEUE_HOOKS,
      async (job) => {
        try {
          await this.processHooks(job);
        } catch (error) {
          this._jobErrorHandler(error as Error);
          throw error;
        }
      }
    );
  }

  async subscribeBlockCheckpointQueue (): Promise<void> {
    await this.jobQueue.subscribe(
      QUEUE_BLOCK_CHECKPOINT,
      async (job) => {
        try {
          this.processCheckpoint(job);
        } catch (error) {
          this._jobErrorHandler(error as Error);
          throw error;
        }
      }
    );
  }

  async processBlock (job: any): Promise<void> {
    const { data: { kind } } = job;

    switch (kind) {
      case JOB_KIND_INDEX: {
        // Update metrics
        isSyncingHistoricalBlocks.set(0);

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

        // Switch clients if getLogs requests are too slow
        if (await this._indexer.isGetLogsRequestsSlow()) {
          await this._indexer.switchClients();
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

  async processHistoricalBlocks (job: PgBoss.JobWithDoneCallback<HistoricalJobData, HistoricalJobResponseData>): Promise<void> {
    // Update metrics
    isSyncingHistoricalBlocks.set(1);

    const { data: { blockNumber: startBlock, processingEndBlockNumber } } = job;

    if (this._historicalProcessingCompletedUpto) {
      // Check if historical processing start is for a previous block which happens incase of template create
      if (startBlock < this._historicalProcessingCompletedUpto) {
        await Promise.all([
          // Delete any pending historical processing jobs
          this.jobQueue.deleteJobs(QUEUE_HISTORICAL_PROCESSING),
          // Remove pending events queue jobs
          this.jobQueue.deleteJobs(QUEUE_EVENT_PROCESSING)
        ]);

        // Wait for events queue to be empty
        log(`Waiting for events queue to be empty before resetting watcher to block ${startBlock - 1}`);
        await this.jobQueue.waitForEmptyQueue(QUEUE_EVENT_PROCESSING);

        // Remove all watcher blocks and events data if startBlock is less than this._historicalProcessingCompletedUpto
        // This occurs when new contract is added (with filterLogsByAddresses set to true) and historical processing is restarted from a previous block
        log(`Restarting historical processing from block ${startBlock}`);
        await this._indexer.resetWatcherToBlock(startBlock - 1);
      } else {
        // Check that startBlock is one greater than previous batch end block
        if (startBlock - 1 !== this._historicalProcessingCompletedUpto) {
          await this.jobQueue.markComplete(
            job,
            { isComplete: false }
          );

          return;
        }
      }
    }

    this._lastHistoricalProcessingEndBlockNumber = processingEndBlockNumber;
    const logsBlockRange = this._jobQueueConfig.historicalLogsBlockRange ?? DEFAULT_HISTORICAL_LOGS_BLOCK_RANGE;
    let rangeEndBlock = startBlock + logsBlockRange;

    if (this._jobQueueConfig.historicalLogsBlockRangeEndFactor) {
      // Set rangeEndBlock to the next multiple of historicalLogsBlockRangeEndFactor after startBlock number
      // For using aligned block ranges
      rangeEndBlock = Math.ceil(startBlock / this._jobQueueConfig.historicalLogsBlockRangeEndFactor) * this._jobQueueConfig.historicalLogsBlockRangeEndFactor;
    }

    const endBlock = Math.min(rangeEndBlock, processingEndBlockNumber);
    log(`Processing historical blocks from ${startBlock} to ${endBlock}`);

    const blocks = await fetchAndSaveFilteredLogsAndBlocks(
      this._indexer,
      this._blockAndEventsMap,
      startBlock,
      endBlock
    );

    const blocksLength = blocks.length;

    if (blocksLength) {
      if (this._errorInEventsProcessing) {
        log('Events processing encountered error. Aborting pushing blocks to events queue from historical processing');
        await this.jobQueue.markComplete(
          job,
          { isComplete: false, endBlock }
        );

        return;
      }

      // Push event processing job for each block
      await this._pushEventProcessingJobsForBlocks(blocks, false);
    }

    // Update sync status canonical, indexed and chain head block to end block
    // Update with zero hash as they won't be used during historical processing
    await this._indexer.updateSyncStatus({
      latestCanonicalBlockHash: constants.HashZero,
      latestIndexedBlockHash: constants.HashZero,
      chainHeadBlockHash: constants.HashZero,
      latestCanonicalBlockNumber: endBlock,
      latestIndexedBlockNumber: endBlock,
      chainHeadBlockNumber: endBlock
    });
    log(`Sync status canonical, indexed and chain head block updated to ${endBlock}`);

    this._historicalProcessingCompletedUpto = endBlock;

    // Switch clients if getLogs requests are too slow
    if (await this._indexer.isGetLogsRequestsSlow()) {
      await this._indexer.switchClients();
    }

    if (endBlock < processingEndBlockNumber) {
      // If endBlock is lesser than processingEndBlockNumber push new historical job
      await this.jobQueue.pushJob(
        QUEUE_HISTORICAL_PROCESSING,
        {
          blockNumber: endBlock + 1,
          processingEndBlockNumber: processingEndBlockNumber
        }
      );
    }

    await this.jobQueue.markComplete(
      job,
      { isComplete: true, endBlock }
    );
  }

  async _pushEventProcessingJobsForBlocks (blocks: BlockProgressInterface[], isRealtimeProcessing: boolean): Promise<void> {
    // Push event processing job for each block
    // const pushJobForBlockPromises = blocks.map(async block => {
    for (const block of blocks) {
      const eventsProcessingJob: EventsJobData = {
        kind: EventsQueueJobKind.EVENTS,
        blockHash: block.blockHash,
        publish: true,
        isRealtimeProcessing
      };

      await this.jobQueue.pushJob(QUEUE_EVENT_PROCESSING, eventsProcessingJob);
    }
  }

  async processEvent (job: PgBoss.JobWithMetadataDoneCallback<EventsJobData | ContractJobData, object>): Promise<void> {
    const { data: jobData, retrycount: retryCount } = job;

    switch (jobData.kind) {
      case EventsQueueJobKind.EVENTS:
        await this._processEvents(jobData, retryCount);
        break;

      case EventsQueueJobKind.CONTRACT:
        this._updateWatchedContracts(job);
        break;
    }

    await this.jobQueue.markComplete(job);

    // Shutdown after job gets marked as complete
    if (this._shutDown) {
      log(`Graceful shutdown after ${QUEUE_EVENT_PROCESSING} queue ${jobData.kind} kind job ${job.id}`);
      this.jobQueue.stop();
      process.exit(0);
    }
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

  async resetToLatestProcessedBlock (): Promise<void> {
    const syncStatus = await this._indexer.getSyncStatus();

    // Watcher running for first time if syncStatus does not exist
    if (!syncStatus) {
      return;
    }

    const blockProgress = await this._indexer.getBlockProgress(syncStatus.latestProcessedBlockHash);
    assert(blockProgress);
    assert(blockProgress.isComplete);

    // Resetting to block with events that have been processed completely
    // Reprocessing of block events in subgraph watchers is not possible as DB transaction is not implemented.
    await this._indexer.resetWatcherToBlock(blockProgress.blockNumber);
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
    if (!(syncStatus.latestIndexedBlockNumber >= (pruneBlockHeight + MAX_REORG_DEPTH))) {
      const message = `Pruning is not safe at height ${pruneBlockHeight}, latest indexed block height ${syncStatus.latestIndexedBlockNumber}`;
      log(message);
      throw new Error(message);
    }

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
          let indexedBlock: BlockProgressInterface | undefined;
          let indexedBlockHeight = pruneBlockHeight + MAX_REORG_DEPTH;

          // Loop to find latest indexed block incase null block is encountered
          while (!indexedBlock) {
            [indexedBlock] = await this._indexer.getBlocksAtHeight(indexedBlockHeight, false);
            --indexedBlockHeight;
            assert(indexedBlockHeight > pruneBlockHeight, `No blocks found above pruneBlockHeight ${pruneBlockHeight}`);
          }

          // Get ancestor blockHash from indexed block at prune height.
          const ancestorBlockHash = await this._indexer.getAncestorAtHeight(indexedBlock.blockHash, pruneBlockHeight);
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
        const [block] = await this._indexer.getBlocks({ blockHash: parentHash });

        if (!block) {
          const message = `No blocks at parentHash ${parentHash}, aborting`;
          log(message);

          throw new Error(message);
        }

        this._blockAndEventsMap.set(
          block.blockHash,
          {
            // block is set later in job when saving to database
            block: {} as BlockProgressInterface,
            events: [],
            ethFullBlock: block,
            // Transactions are set later in job when fetching events
            ethFullTransactions: []
          }
        );

        const { cid: parentCid, blockNumber: parentBlockNumber, parentHash: grandparentHash, timestamp: parentTimestamp } = block;

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
      }
    }

    const data = this._blockAndEventsMap.get(blockHash);
    assert(data);

    if (!blockProgress) {
      // Delay required to process block.
      const { jobDelayInMilliSecs = 0 } = this._jobQueueConfig;
      await wait(jobDelayInMilliSecs);

      console.time('time:job-runner#_indexBlock-saveBlockAndFetchEvents');
      log(`_indexBlock#saveBlockAndFetchEvents: fetching from upstream server ${blockHash}`);
      let ethFullTransactions;
      [blockProgress, , ethFullTransactions] = await this._indexer.saveBlockAndFetchEvents({ cid, blockHash, blockNumber, parentHash, blockTimestamp });
      log(`_indexBlock#saveBlockAndFetchEvents: fetched for block: ${blockProgress.blockHash} num events: ${blockProgress.numEvents}`);
      console.timeEnd('time:job-runner#_indexBlock-saveBlockAndFetchEvents');

      this._blockAndEventsMap.set(
        blockHash,
        {
          ...data,
          block: blockProgress,
          ethFullTransactions
        });
    } else {
      const events = await this._indexer.getBlockEvents(blockHash, {}, {});

      const txHashList = Array.from([
        ...new Set<string>(events.map((event) => event.txHash))
      ]);

      const ethFullTransactions = await this._indexer.getFullTransactions(txHashList);

      // const ethFullTransactions =
      this._blockAndEventsMap.set(
        blockHash,
        {
          ...data,
          block: blockProgress,
          ethFullTransactions
        });
    }

    if (!blockProgress.isComplete) {
      await this._indexer.processBlock(blockProgress);
    }

    // Push job to event processing queue.
    // Block with all events processed or no events will not be processed again due to check in _processEvents.
    await this._pushEventProcessingJobsForBlocks([blockProgress], true);

    const indexBlockDuration = new Date().getTime() - indexBlockStartTime.getTime();
    log(`time:job-runner#_indexBlock: ${indexBlockDuration}ms`);
  }

  async _processEvents (jobData: EventsJobData, retryCount: number): Promise<void> {
    const { blockHash } = jobData;
    const prefetchedBlock = this._blockAndEventsMap.get(blockHash);
    assert(prefetchedBlock);
    const { block, ethFullBlock, ethFullTransactions } = prefetchedBlock;
    assert(block, 'BlockProgress not set in blockAndEvents map');

    try {
      log(`Processing events for block ${block.blockNumber}`);

      console.time(`time:job-runner#_processEvents-events-${block.blockNumber}`);
      const isNewContractWatched = await processBatchEvents(
        this._indexer,
        {
          block,
          ethFullBlock,
          ethFullTransactions
        },
        {
          eventsInBatch: this._jobQueueConfig.eventsInBatch,
          subgraphEventsOrder: this._jobQueueConfig.subgraphEventsOrder
        }
      );
      console.timeEnd(`time:job-runner#_processEvents-events-${block.blockNumber}`);

      this._blockAndEventsMap.delete(block.blockHash);

      // Check if new contract was added
      if (isNewContractWatched) {
        // Check if historical processing is running and that current block being processed was trigerred by historical processing
        if (this._historicalProcessingCompletedUpto && this._historicalProcessingCompletedUpto > block.blockNumber) {
          const nextBlockNumberToProcess = block.blockNumber + 1;

          // Delete jobs for any pending historical processing
          await this.jobQueue.deleteJobs(QUEUE_HISTORICAL_PROCESSING);

          // Push a new job to restart historical blocks processing after current block
          log('New contract added in historical processing with filterLogsByAddresses set to true');
          await this.jobQueue.pushJob(
            QUEUE_HISTORICAL_PROCESSING,
            {
              blockNumber: nextBlockNumberToProcess,
              processingEndBlockNumber: this._lastHistoricalProcessingEndBlockNumber
            },
            { priority: 1 }
          );
        }

        // Delete jobs for any pending events processing
        await this.jobQueue.deleteJobs(QUEUE_EVENT_PROCESSING);
      }

      // Update metrics
      if (this._endBlockProcessTimer) {
        this._endBlockProcessTimer();
      }
      lastProcessedBlockNumber.set(block.blockNumber);
      lastBlockNumEvents.set(block.numEvents);

      this._endBlockProcessTimer = lastBlockProcessDuration.startTimer();

      console.time('time:job-runner#_processEvents-update-status-and-remove-unknown-events');
      await Promise.all([
        // Update latest processed block in SyncStatus
        this._indexer.updateSyncStatusProcessedBlock(block.blockHash, block.blockNumber),
        // Remove the unknown events from processed block
        this._indexer.removeUnknownEvents(block)
      ]);
      console.timeEnd('time:job-runner#_processEvents-update-status-and-remove-unknown-events');

      if (retryCount > 0) {
        await Promise.all([
          // If this was a retry attempt, unset the indexing error flag in sync status
          this._indexer.updateSyncStatusIndexingError(false),
          // Reset watcher after succesfull retry so that block processing starts after this block
          this._indexer.resetWatcherToBlock(block.blockNumber)
        ]);

        log(`Watcher reset to block ${block.blockNumber} after succesffully retrying events processing`);
      }

      this._errorInEventsProcessing = false;
    } catch (error) {
      log(`Error in processing events for block ${block.blockNumber} hash ${block.blockHash}`);
      this._errorInEventsProcessing = true;

      await Promise.all([
        // Remove processed data for current block to avoid reprocessing of events
        this._indexer.clearProcessedBlockData(block),
        // Delete all pending event processing jobs
        this.jobQueue.deleteJobs(QUEUE_EVENT_PROCESSING),
        // Delete all active and pending historical processing jobs
        this.jobQueue.deleteJobs(QUEUE_HISTORICAL_PROCESSING, 'completed'),
        // Set the indexing error flag in sync status
        this._indexer.updateSyncStatusIndexingError(true)
      ]);

      // Error logged in job-queue handler
      throw error;
    }
  }

  async _jobErrorHandler (error: any): Promise<void> {
    if (
      // Switch client if it is a server error from ethers.js
      // https://docs.ethers.org/v5/api/utils/logger/#errors--server-error
      error.code === ethersErrors.SERVER_ERROR ||
      // Switch client if it is a timeout error from ethers.js
      // https://docs.ethers.org/v5/api/utils/logger/#errors--timeout
      error.code === ethersErrors.TIMEOUT ||
      // Switch client if error is for max retries to get new block at head
      error.message === NEW_BLOCK_MAX_RETRIES_ERROR
    ) {
      log('RPC endpoint is not working; failing over to another one');
      await this._indexer.switchClients();
    }
  }

  _updateWatchedContracts (job: any): void {
    const { data: { contract } } = job;
    this._indexer.cacheContract(contract);
    this._indexer.updateStateStatusMap(contract.address, {});
  }
}
