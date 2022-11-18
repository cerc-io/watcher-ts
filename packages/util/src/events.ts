//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'graphql-subscriptions';

import { EthClient } from '@cerc-io/ipld-eth-client';

import { JobQueue } from './job-queue';
import { BlockProgressInterface, EventInterface, IndexerInterface } from './types';
import { MAX_REORG_DEPTH, JOB_KIND_PRUNE, JOB_KIND_INDEX, UNKNOWN_EVENT_NAME, JOB_KIND_EVENTS } from './constants';
import { createPruningJob, processBlockByNumberWithCache } from './common';
import { UpstreamConfig } from './config';
import { OrderDirection } from './database';

const log = debug('vulcanize:events');

export const BlockProgressEvent = 'block-progress-event';

export class EventWatcher {
  _ethClient: EthClient
  _indexer: IndexerInterface
  _subscription?: ZenObservable.Subscription
  _pubsub: PubSub
  _jobQueue: JobQueue
  _upstreamConfig: UpstreamConfig

  constructor (upstreamConfig: UpstreamConfig, ethClient: EthClient, indexer: IndexerInterface, pubsub: PubSub, jobQueue: JobQueue) {
    this._upstreamConfig = upstreamConfig;
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([BlockProgressEvent]);
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream blocks');
      this._subscription.unsubscribe();
    }
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

    // Wait for block processing as blockProgress event might process the same block.
    await processBlockByNumberWithCache(this._jobQueue, startBlockNumber);

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

      if (isComplete) {
        await processBlockByNumberWithCache(this._jobQueue, blockNumber + 1);
      }
    }
  }

  async blockProcessingCompleteHandler (job: any): Promise<void> {
    const { data: { request: { data } } } = job;
    const { kind } = data;

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

  async eventProcessingCompleteHandler (job: any): Promise<EventInterface[]> {
    const { data: { request: { data: { kind, blockHash } } } } = job;

    // Ignore jobs other than JOB_KIND_EVENTS
    if (kind !== JOB_KIND_EVENTS) {
      return [];
    }
    assert(blockHash);

    const blockProgress = await this._indexer.getBlockProgress(blockHash);
    assert(blockProgress);

    await this.publishBlockProgressToSubscribers(blockProgress);

    return this._indexer.getBlockEvents(
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
