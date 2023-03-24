//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'graphql-subscriptions';

import { EthClient } from '@cerc-io/ipld-eth-client';

import { JobQueue } from './job-queue';
import { BlockProgressInterface, EventInterface, IndexerInterface } from './types';
import { MAX_REORG_DEPTH, JOB_KIND_PRUNE, JOB_KIND_INDEX, UNKNOWN_EVENT_NAME, JOB_KIND_EVENTS, QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING } from './constants';
import { createPruningJob, processBlockByNumber } from './common';
import { OrderDirection } from './database';

const EVENT = 'event';

const log = debug('vulcanize:events');

export const BlockProgressEvent = 'block-progress-event';

export class EventWatcher {
  _ethClient: EthClient;
  _indexer: IndexerInterface;
  _pubsub: PubSub;
  _jobQueue: JobQueue;

  _shutDown = false;
  _signalCount = 0;

  constructor (ethClient: EthClient, indexer: IndexerInterface, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([EVENT]);
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([BlockProgressEvent]);
  }

  async start (): Promise<void> {
    await this.initBlockProcessingOnCompleteHandler();
    await this.initEventProcessingOnCompleteHandler();

    this.startBlockProcessing();

    this.handleShutdown();
  }

  async initBlockProcessingOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this.blockProcessingCompleteHandler(job);
    });
  }

  async initEventProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      await this.eventProcessingCompleteHandler(job);
    });
  }

  async startBlockProcessing (): Promise<void> {
    const syncStatus = await this._indexer.getSyncStatus();
    let startBlockNumber: number;

    if (!syncStatus) {
      // Get latest block in chain.
      const { block: currentBlock } = await this._ethClient.getBlockByHash();
      startBlockNumber = currentBlock.number;
    } else {
      startBlockNumber = syncStatus.chainHeadBlockNumber + 1;
    }

    await processBlockByNumber(this._jobQueue, startBlockNumber);

    // Creating an AsyncIterable from AsyncIterator to iterate over the values.
    // https://www.codementor.io/@tiagolopesferreira/asynchronous-iterators-in-javascript-jl1yg8la1#for-wait-of
    const blockProgressEventIterable = {
      // getBlockProgressEventIterator returns an AsyncIterator which can be used to listen to BlockProgress events.
      [Symbol.asyncIterator]: this.getBlockProgressEventIterator.bind(this)
    };

    // Iterate over async iterable.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of
    for await (const data of blockProgressEventIterable) {
      const { onBlockProgressEvent: { blockNumber, isComplete } } = data;

      if (this._shutDown) {
        log(`Graceful shutdown after processing block ${blockNumber}`);
        process.exit(0);
      }

      if (isComplete) {
        await processBlockByNumber(this._jobQueue, blockNumber + 1);
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

  async eventProcessingCompleteHandler (job: any): Promise<void> {
    const { id, data: { request, failed, state, createdOn } } = job;

    if (failed) {
      log(`Job ${id} for queue ${QUEUE_EVENT_PROCESSING} failed`);
      return;
    }

    const { data: { kind, blockHash } } = request;

    // Ignore jobs other than JOB_KIND_EVENTS
    if (kind !== JOB_KIND_EVENTS) {
      return;
    }

    assert(blockHash);

    const blockProgress = await this._indexer.getBlockProgress(blockHash);
    assert(blockProgress);

    await this.publishBlockProgressToSubscribers(blockProgress);

    const dbEvents = await this._indexer.getBlockEvents(
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

    const timeElapsedInSeconds = (Date.now() - Date.parse(createdOn)) / 1000;

    // Cannot publish individual event as they are processed together in a single job.
    // TODO: Use a different pubsub to publish event from job-runner.
    // https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
    for (const dbEvent of dbEvents) {
      log(`Job onComplete event ${dbEvent.id} publish ${!!request.data.publish}`);

      if (!failed && state === 'completed' && request.data.publish) {
        // Check for max acceptable lag time between request and sending results to live subscribers.
        if (timeElapsedInSeconds <= this._jobQueue.maxCompletionLag) {
          await this.publishEventToSubscribers(dbEvent, timeElapsedInSeconds);
        } else {
          log(`event ${dbEvent.id} is too old (${timeElapsedInSeconds}s), not broadcasting to live subscribers`);
        }
      }
    }
  }

  async publishBlockProgressToSubscribers (blockProgress: BlockProgressInterface): Promise<void> {
    const { cid, blockHash, blockNumber, numEvents, numProcessedEvents, isComplete } = blockProgress;

    // Publishing the event here will result in pushing the payload to GQL subscribers for `onAddressEvent(address)`.
    await this._pubsub.publish(BlockProgressEvent, {
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
