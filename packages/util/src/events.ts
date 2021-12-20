//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { JobQueue } from './job-queue';
import { BlockProgressInterface, EventInterface, IndexerInterface } from './types';
import { MAX_REORG_DEPTH, JOB_KIND_PRUNE, JOB_KIND_INDEX, UNKNOWN_EVENT_NAME } from './constants';
import { createPruningJob, processBlockByNumber } from './common';
import { UpstreamConfig } from './config';
import { OrderDirection } from './database';

const log = debug('vulcanize:events');

export const BlockProgressEvent = 'block-progress-event';

export class EventWatcher {
  _ethClient: EthClient
  _postgraphileClient: EthClient
  _indexer: IndexerInterface
  _subscription?: ZenObservable.Subscription
  _pubsub: PubSub
  _jobQueue: JobQueue
  _upstreamConfig: UpstreamConfig

  constructor (upstreamConfig: UpstreamConfig, ethClient: EthClient, postgraphileClient: EthClient, indexer: IndexerInterface, pubsub: PubSub, jobQueue: JobQueue) {
    this._upstreamConfig = upstreamConfig;
    this._ethClient = ethClient;
    this._postgraphileClient = postgraphileClient;
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
    let startBlockNumber;

    if (!syncStatus) {
      // Get latest block in chain.
      const { block: currentBlock } = await this._ethClient.getBlockByHash();
      startBlockNumber = currentBlock.number;
    } else {
      startBlockNumber = syncStatus.chainHeadBlockNumber + 1;
    }

    const { ethServer: { blockDelayInMilliSecs } } = this._upstreamConfig;

    processBlockByNumber(this._jobQueue, this._indexer, blockDelayInMilliSecs, startBlockNumber);

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
        processBlockByNumber(this._jobQueue, this._indexer, blockDelayInMilliSecs, blockNumber + 1);
      }
    }
  }

  async blockProcessingCompleteHandler (job: any): Promise<void> {
    const { data: { request: { data } } } = job;
    const { kind } = data;

    switch (kind) {
      case JOB_KIND_INDEX:
        this._handleIndexingComplete(data);
        break;

      case JOB_KIND_PRUNE:
        this._handlePruningComplete(data);
        break;

      default:
        throw new Error(`Invalid Job kind ${kind} in complete handler of QUEUE_BLOCK_PROCESSING.`);
    }
  }

  async eventProcessingCompleteHandler (job: any): Promise<EventInterface[]> {
    const { data: { request: { data: { blockHash } } } } = job;
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
    const { blockHash, blockNumber, numEvents, numProcessedEvents, isComplete } = blockProgress;

    // Publishing the event here will result in pushing the payload to GQL subscribers for `onAddressEvent(address)`.
    await this._pubsub.publish(BlockProgressEvent, {
      onBlockProgressEvent: {
        blockHash,
        blockNumber,
        numEvents,
        numProcessedEvents,
        isComplete
      }
    });
  }

  async _handleIndexingComplete (jobData: any): Promise<void> {
    const { blockHash, blockNumber, priority } = jobData;
    log(`Job onComplete indexing block ${blockHash} ${blockNumber}`);

    const [blockProgress, syncStatus] = await Promise.all([
      this._indexer.getBlockProgress(blockHash),
      this._indexer.updateSyncStatusIndexedBlock(blockHash, blockNumber)
    ]);

    // Create pruning job if required.
    if (syncStatus && syncStatus.latestIndexedBlockNumber > (syncStatus.latestCanonicalBlockNumber + MAX_REORG_DEPTH)) {
      await createPruningJob(this._jobQueue, syncStatus.latestCanonicalBlockNumber, priority);
    }

    // Publish block progress event if no events exist.
    // Event for blocks with events will be pusblished from eventProcessingCompleteHandler.
    if (blockProgress && blockProgress.numEvents === 0) {
      await this.publishBlockProgressToSubscribers(blockProgress);
    }
  }

  async _handlePruningComplete (jobData: any): Promise<void> {
    const { pruneBlockHeight } = jobData;
    log(`Job onComplete pruning at height ${pruneBlockHeight}`);
  }
}
