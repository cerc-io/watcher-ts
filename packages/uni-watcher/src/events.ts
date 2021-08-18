//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import {
  JobQueue,
  EventWatcher as BaseEventWatcher,
  MAX_REORG_DEPTH,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  QUEUE_CHAIN_PRUNING,
  EventWatcherInterface
} from '@vulcanize/util';

import { Indexer } from './indexer';
import { Event, UNKNOWN_EVENT_NAME } from './entity/Event';

const log = debug('vulcanize:events');

export const UniswapEvent = 'uniswap-event';

export class EventWatcher implements EventWatcherInterface {
  _ethClient: EthClient
  _indexer: Indexer
  _subscription?: ZenObservable.Subscription
  _pubsub: PubSub
  _jobQueue: JobQueue
  _eventWatcher: BaseEventWatcher

  constructor (ethClient: EthClient, indexer: Indexer, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
    this._eventWatcher = new BaseEventWatcher(this._ethClient, this._indexer, this._pubsub, this._jobQueue);
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([UniswapEvent]);
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._eventWatcher.getBlockProgressEventIterator();
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');

    await this.watchBlocksAtChainHead();
    await this.initBlockProcessingOnCompleteHandler();
    await this.initEventProcessingOnCompleteHandler();
    await this.initChainPruningOnCompleteHandler();
  }

  async watchBlocksAtChainHead (): Promise<void> {
    log('Started watching upstream blocks...');
    this._subscription = await this._ethClient.watchBlocks(async (value) => {
      const { blockHash, blockNumber, parentHash, timestamp } = _.get(value, 'data.listen.relatedNode');

      await this._indexer.updateSyncStatusChainHead(blockHash, blockNumber);

      log('watchBlock', blockHash, blockNumber);

      await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { blockHash, blockNumber, parentHash, timestamp });
    });
  }

  async initBlockProcessingOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      const { data: { request: { data: { blockHash, blockNumber } } } } = job;
      log(`Job onComplete block ${blockHash} ${blockNumber}`);

      // Update sync progress.
      const syncStatus = await this._indexer.updateSyncStatusIndexedBlock(blockHash, blockNumber);

      // Create pruning job if required.
      if (syncStatus && syncStatus.latestIndexedBlockNumber > (syncStatus.latestCanonicalBlockNumber + MAX_REORG_DEPTH)) {
        // Create a job to prune at block height (latestCanonicalBlockNumber + 1)
        const pruneBlockHeight = syncStatus.latestCanonicalBlockNumber + 1;
        // TODO: Move this to the block processing queue to run pruning jobs at a higher priority than block processing jobs.
        await this._jobQueue.pushJob(QUEUE_CHAIN_PRUNING, { pruneBlockHeight });
      }

      // Publish block progress event.
      const blockProgress = await this._indexer.getBlockProgress(blockHash);
      if (blockProgress) {
        await this._eventWatcher.publishBlockProgressToSubscribers(blockProgress);
      }
    });
  }

  async initEventProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      const dbEvent = await this._eventWatcher.eventProcessingCompleteHandler(job);

      const { data: { request, failed, state, createdOn } } = job;

      const timeElapsedInSeconds = (Date.now() - Date.parse(createdOn)) / 1000;
      log(`Job onComplete event ${request.data.id} publish ${!!request.data.publish}`);
      if (!failed && state === 'completed' && request.data.publish) {
        // Check for max acceptable lag time between request and sending results to live subscribers.
        if (timeElapsedInSeconds <= this._jobQueue.maxCompletionLag) {
          await this.publishUniswapEventToSubscribers(dbEvent, timeElapsedInSeconds);
        } else {
          log(`event ${request.data.id} is too old (${timeElapsedInSeconds}s), not broadcasting to live subscribers`);
        }
      }
    });
  }

  async initChainPruningOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_CHAIN_PRUNING, async (job) => {
      const { data: { request: { data: { pruneBlockHeight } } } } = job;
      log(`Job onComplete chain pruning ${pruneBlockHeight}`);

      const blocks = await this._indexer.getBlocksAtHeight(pruneBlockHeight, false);

      // Only one canonical (not pruned) block should exist at the pruned height.
      assert(blocks.length === 1);
      const [block] = blocks;

      await this._indexer.updateSyncStatusCanonicalBlock(block.blockHash, block.blockNumber);
    });
  }

  async publishUniswapEventToSubscribers (dbEvent: Event, timeElapsedInSeconds: number): Promise<void> {
    if (dbEvent && dbEvent.eventName !== UNKNOWN_EVENT_NAME) {
      const resultEvent = this._indexer.getResultEvent(dbEvent);

      log(`pushing event to GQL subscribers (${timeElapsedInSeconds}s elapsed): ${resultEvent.event.__typename}`);

      // Publishing the event here will result in pushing the payload to GQL subscribers for `onEvent`.
      await this._pubsub.publish(UniswapEvent, {
        onEvent: resultEvent
      });
    }
  }
}
