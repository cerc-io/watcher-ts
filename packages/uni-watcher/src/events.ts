//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import {
  JobQueue,
  EventWatcher as BaseEventWatcher,
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
  _baseEventWatcher: BaseEventWatcher

  constructor (ethClient: EthClient, indexer: Indexer, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
    this._baseEventWatcher = new BaseEventWatcher(this._ethClient, this._indexer, this._pubsub, this._jobQueue);
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([UniswapEvent]);
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._baseEventWatcher.getBlockProgressEventIterator();
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');

    await this.watchBlocksAtChainHead();
    await this.initBlockProcessingOnCompleteHandler();
    await this.initEventProcessingOnCompleteHandler();
    await this.initChainPruningOnCompleteHandler();
  }

  async stop (): Promise<void> {
    this._baseEventWatcher.stop();
  }

  async watchBlocksAtChainHead (): Promise<void> {
    log('Started watching upstream blocks...');
    this._subscription = await this._ethClient.watchBlocks(async (value) => {
      await this._baseEventWatcher.blocksHandler(value);
    });
  }

  async initBlockProcessingOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this._baseEventWatcher.blockProcessingCompleteHandler(job);
    });
  }

  async initEventProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      const dbEvent = await this._baseEventWatcher.eventProcessingCompleteHandler(job);

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
      await this._baseEventWatcher.chainPruningCompleteHandler(job);
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
