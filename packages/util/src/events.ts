//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'graphql-subscriptions';
import PgBoss from 'pg-boss';

import { JobQueue } from './job-queue';
import { BlockProgressInterface, EventInterface, IndexerInterface, EthClient, EventsJobData, EventsQueueJobKind } from './types';
import { MAX_REORG_DEPTH, JOB_KIND_PRUNE, JOB_KIND_INDEX, UNKNOWN_EVENT_NAME, QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING, QUEUE_HISTORICAL_PROCESSING } from './constants';
import { createPruningJob, processBlockByNumber } from './common';
import { OrderDirection } from './database';
import { HistoricalJobData, HistoricalJobResponseData } from './job-runner';
import { JobQueueConfig, ServerConfig } from './config';
import { wait } from './misc';

const EVENT = 'event';
const BLOCK_PROGRESS_EVENT = 'block-progress-event';
const REALTIME_BLOCK_COMPLETE_EVENT = 'realtime-block-complete-event';

const DEFAULT_HISTORICAL_MAX_FETCH_AHEAD = 20_000;

const log = debug('vulcanize:events');

interface Config {
  server: ServerConfig;
  jobQueue: JobQueueConfig;
}

interface RealtimeBlockCompleteEvent {
  blockNumber: number;
  isComplete: boolean;
}

export class EventWatcher {
  _config: Config;
  _ethClient: EthClient;
  _indexer: IndexerInterface;
  _pubsub: PubSub;
  _jobQueue: JobQueue;
  _realtimeProcessingStarted = false;

  _shutDown = false;
  _signalCount = 0;
  _historicalProcessingEndBlockNumber = 0;

  constructor (config: Config, ethClient: EthClient, indexer: IndexerInterface, pubsub: PubSub, jobQueue: JobQueue) {
    this._config = config;
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([EVENT]);
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([BLOCK_PROGRESS_EVENT]);
  }

  getRealtimeBlockCompleteEvent (): AsyncIterator<{ onRealtimeBlockCompleteEvent: RealtimeBlockCompleteEvent }> {
    return this._pubsub.asyncIterator(REALTIME_BLOCK_COMPLETE_EVENT);
  }

  async start (): Promise<void> {
    await this.initBlockProcessingOnCompleteHandler();
    await this.initHistoricalProcessingOnCompleteHandler();
    await this.initEventProcessingOnCompleteHandler();

    this.startBlockProcessing();

    this.handleShutdown();
  }

  async initBlockProcessingOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(
      QUEUE_BLOCK_PROCESSING,
      async (job) => this.blockProcessingCompleteHandler(job)
    );
  }

  async initHistoricalProcessingOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(
      QUEUE_HISTORICAL_PROCESSING,
      async (job) => this.historicalProcessingCompleteHandler(job)
    );
  }

  async initEventProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(
      QUEUE_EVENT_PROCESSING,
      async (job) => this.eventProcessingCompleteHandler(job as PgBoss.JobWithMetadata),
      { includeMetadata: true }
    );
  }

  async startBlockProcessing (): Promise<void> {
    // Wait for events job queue to be empty before starting historical or realtime processing
    await this._jobQueue.waitForEmptyQueue(QUEUE_EVENT_PROCESSING);

    // Get latest block in chain and sync status from DB
    // Also get historical-processing queue size
    const [{ block: latestBlock }, syncStatus, historicalProcessingQueueSize] = await Promise.all([
      this._ethClient.getBlockByHash(),
      this._indexer.getSyncStatus(),
      this._jobQueue.getQueueSize(QUEUE_HISTORICAL_PROCESSING, 'completed')
    ]);

    // Stop if there are active or pending historical processing jobs
    // Might be created on encountering template create in events processing
    if (historicalProcessingQueueSize > 0) {
      return;
    }

    const latestCanonicalBlockNumber = latestBlock.number - MAX_REORG_DEPTH;
    let startBlockNumber = latestBlock.number;

    if (syncStatus) {
      startBlockNumber = syncStatus.chainHeadBlockNumber + 1;
    }

    // Perform checks before starting historical block processing
    if (
      // Skip historical block processing if any block handler exists
      !this._indexer.graphWatcher?.blockHandlerExists &&
      // Run historical block processing if useBlockRanges is enabled
      this._config.jobQueue.useBlockRanges &&
      // Only run historical block processing if we are below the frothy region
      startBlockNumber < latestCanonicalBlockNumber
    ) {
      await this.startHistoricalBlockProcessing(startBlockNumber, latestCanonicalBlockNumber);

      return;
    }

    await this.startRealtimeBlockProcessing(startBlockNumber);
  }

  async startHistoricalBlockProcessing (startBlockNumber: number, latestCanonicalBlockNumber: number): Promise<void> {
    if (this._realtimeProcessingStarted) {
      // Do not start historical processing if realtime processing has already started
      return;
    }

    let endBlockNumber = latestCanonicalBlockNumber;
    const historicalMaxFetchAhead = this._config.jobQueue.historicalMaxFetchAhead ?? DEFAULT_HISTORICAL_MAX_FETCH_AHEAD;

    if (historicalMaxFetchAhead > 0) {
      endBlockNumber = Math.min(startBlockNumber + historicalMaxFetchAhead, endBlockNumber);
    }

    this._historicalProcessingEndBlockNumber = endBlockNumber;
    log(`Starting historical block processing in batches from ${startBlockNumber} up to block ${this._historicalProcessingEndBlockNumber}`);

    // Push job for historical block processing
    await this._jobQueue.pushJob(
      QUEUE_HISTORICAL_PROCESSING,
      {
        blockNumber: startBlockNumber,
        processingEndBlockNumber: this._historicalProcessingEndBlockNumber
      },
      { priority: 1 }
    );
  }

  async startRealtimeBlockProcessing (startBlockNumber: number): Promise<void> {
    // Check if realtime processing already started
    if (this._realtimeProcessingStarted) {
      return;
    }

    log(`Starting realtime block processing from block ${startBlockNumber}`);
    await processBlockByNumber(this._jobQueue, startBlockNumber);

    this._realtimeProcessingStarted = true;

    // Creating an AsyncIterable from AsyncIterator to iterate over the values.
    // https://www.codementor.io/@tiagolopesferreira/asynchronous-iterators-in-javascript-jl1yg8la1#for-wait-of
    const realtimeBlockCompleteEventIterable = {
      // getRealtimeBlockCompleteEvent returns an AsyncIterator which can be used to listen to realtime processing block complete events.
      [Symbol.asyncIterator]: this.getRealtimeBlockCompleteEvent.bind(this)
    };

    // Iterate over async iterable.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of
    for await (const data of realtimeBlockCompleteEventIterable) {
      const { onRealtimeBlockCompleteEvent: { blockNumber, isComplete } } = data;

      if (this._shutDown) {
        log(`Graceful shutdown after processing block ${blockNumber}`);
        process.exit(0);
      }

      if (isComplete) {
        while (true) {
          const { block: latestBlock } = await this._ethClient.getBlockByHash();

          // Process block if it is blockProcessingOffset blocks behind latest block
          if (latestBlock.number >= blockNumber + (this._config.jobQueue.blockProcessingOffset ?? 0)) {
            await processBlockByNumber(this._jobQueue, blockNumber + 1);
            break;
          }

          log(`Latest block: ${latestBlock.number}; retry next block to process: ${blockNumber + 1} after ${this._config.jobQueue.blockDelayInMilliSecs}ms`);
          await wait(this._config.jobQueue.blockDelayInMilliSecs);
        }
      }
    }
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
      process.exit(1);
    }
  }

  async blockProcessingCompleteHandler (job: any): Promise<void> {
    const { id, data: { failed, request: { data } } } = job;
    const { kind } = data;

    if (failed) {
      log(`Job ${id} for queue ${QUEUE_BLOCK_PROCESSING} failed`);
      return;
    }

    switch (kind) {
      case JOB_KIND_INDEX:
        await this._handleIndexingComplete(data);
        break;

      case JOB_KIND_PRUNE:
        await this._handlePruningComplete(data);
        break;

      default:
        throw new Error(`Invalid Job kind ${kind} in complete handler of QUEUE_BLOCK_PROCESSING.`);
    }
  }

  async historicalProcessingCompleteHandler (job: PgBoss.Job<any>): Promise<void> {
    const { id, data: { failed, request: { data }, response } } = job;
    const { blockNumber }: HistoricalJobData = data;
    const { isComplete, endBlock: batchEndBlockNumber }: HistoricalJobResponseData = response;

    if (failed || !isComplete) {
      log(`Job ${id} for queue ${QUEUE_HISTORICAL_PROCESSING} failed`);
      return;
    }

    // endBlock exists if isComplete is true
    assert(batchEndBlockNumber);

    const nextBatchStartBlockNumber = batchEndBlockNumber + 1;
    log(`Historical block processing completed for block range: ${blockNumber} to ${batchEndBlockNumber}`);

    // Check if historical processing end block is reached
    if (nextBatchStartBlockNumber > this._historicalProcessingEndBlockNumber) {
      // Start next batch of historical processing or realtime processing
      this.startBlockProcessing();
    }
  }

  async eventProcessingCompleteHandler (job: PgBoss.JobWithMetadata<any>): Promise<void> {
    const { id, data: { request: { data }, failed, state, createdOn, retryCount } } = job;

    if (failed) {
      log(`Job ${id} for queue ${QUEUE_EVENT_PROCESSING} failed`);
      return;
    }

    // Ignore jobs other than event processsing
    const { kind } = data;
    if (kind !== EventsQueueJobKind.EVENTS) {
      return;
    }

    const { blockHash, publish, isRealtimeProcessing }: EventsJobData = data;
    const blockProgress = await this._indexer.getBlockProgress(blockHash);
    assert(blockProgress);

    // Check if job was retried
    if (retryCount > 0) {
      // Start block processing (Try restarting historical processing or continue realtime processing)
      this.startBlockProcessing();
    }

    if (isRealtimeProcessing) {
      await this.publishRealtimeBlockCompleteToSubscribers(blockProgress);
    }

    const dbEventsPromise = this._indexer.getBlockEvents(
      blockProgress.blockHash,
      {
        eventName: [
          { value: UNKNOWN_EVENT_NAME, not: true, operator: 'equals' }
        ]
      },
      {
        orderBy: 'index',
        orderDirection: OrderDirection.asc
      }
    );

    const [dbEvents] = await Promise.all([
      dbEventsPromise,
      this.publishBlockProgressToSubscribers(blockProgress)
    ]);

    const timeElapsedInSeconds = (Date.now() - Date.parse(createdOn)) / 1000;

    // Cannot publish individual event as they are processed together in a single job.
    // TODO: Use a different pubsub to publish event from job-runner.
    // https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
    for (const dbEvent of dbEvents) {
      log(`Job onComplete event ${dbEvent.id} publish ${publish}`);

      if (!failed && state === 'completed' && publish) {
        // Check for max acceptable lag time between request and sending results to live subscribers.
        if (timeElapsedInSeconds <= this._jobQueue.maxCompletionLag) {
          await this.publishEventToSubscribers(dbEvent, timeElapsedInSeconds);
        } else {
          log(`event ${dbEvent.id} is too old (${timeElapsedInSeconds}s), not broadcasting to live subscribers`);
        }
      }
    }
  }

  async publishRealtimeBlockCompleteToSubscribers (blockProgress: BlockProgressInterface): Promise<void> {
    const { blockNumber, isComplete } = blockProgress;

    // Publishing the event here will result in pushing the payload to realtime processing subscriber
    await this._pubsub.publish(REALTIME_BLOCK_COMPLETE_EVENT, {
      onRealtimeBlockCompleteEvent: {
        blockNumber,
        isComplete
      }
    });
  }

  async publishBlockProgressToSubscribers (blockProgress: BlockProgressInterface): Promise<void> {
    const { cid, blockHash, blockNumber, numEvents, numProcessedEvents, isComplete } = blockProgress;

    // Publishing the event here will result in pushing the payload to GQL subscribers for `onAddressEvent(address)`.
    await this._pubsub.publish(BLOCK_PROGRESS_EVENT, {
      onBlockProgressEvent: {
        cid,
        blockHash,
        blockNumber,
        numEvents,
        numProcessedEvents,
        isComplete
      }
    });
  }

  async publishEventToSubscribers (dbEvent: EventInterface, timeElapsedInSeconds: number): Promise<void> {
    if (dbEvent && dbEvent.eventName !== UNKNOWN_EVENT_NAME) {
      const resultEvent = this._indexer.getResultEvent(dbEvent);

      log(`pushing event to GQL subscribers (${timeElapsedInSeconds}s elapsed): ${resultEvent.event.__typename}`);

      // Publishing the event here will result in pushing the payload to GQL subscribers for `onEvent`.
      await this._pubsub.publish(EVENT, {
        onEvent: resultEvent
      });
    }
  }

  async _handleIndexingComplete (jobData: any): Promise<void> {
    const { blockNumber, priority } = jobData;

    const blockProgressEntities = await this._indexer.getBlocksAtHeight(Number(blockNumber), false);

    // Log a warning and return if block entries not found.
    if (blockProgressEntities.length === 0) {
      log(`block not indexed at height ${blockNumber}`);
      return;
    }

    const syncStatus = await this._indexer.updateSyncStatusIndexedBlock(blockProgressEntities[0].blockHash, Number(blockNumber));
    log(`Job onComplete indexing block ${blockProgressEntities[0].blockHash} ${blockNumber}`);

    // Create pruning job if required.
    if (syncStatus && syncStatus.latestIndexedBlockNumber > (syncStatus.latestCanonicalBlockNumber + MAX_REORG_DEPTH)) {
      await createPruningJob(this._jobQueue, syncStatus.latestCanonicalBlockNumber, priority);
    }
  }

  async _handlePruningComplete (jobData: any): Promise<void> {
    const { pruneBlockHeight } = jobData;
    log(`Job onComplete pruning at height ${pruneBlockHeight}`);
  }
}
