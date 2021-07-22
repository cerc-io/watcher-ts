import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { JobQueue } from '@vulcanize/util';

import { Indexer } from './indexer';
import { BlockProgress } from './entity/BlockProgress';
import { UNKNOWN_EVENT_NAME } from './entity/Event';

const log = debug('vulcanize:events');

export const UniswapEvent = 'uniswap-event';
export const BlockProgressEvent = 'block-progress-event';
export const QUEUE_EVENT_PROCESSING = 'event-processing';
export const QUEUE_BLOCK_PROCESSING = 'block-processing';

export class EventWatcher {
  _ethClient: EthClient
  _indexer: Indexer
  _subscription: ZenObservable.Subscription | undefined
  _pubsub: PubSub
  _jobQueue: JobQueue

  constructor (ethClient: EthClient, indexer: Indexer, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([UniswapEvent]);
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([BlockProgressEvent]);
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');

    log('Started watching upstream blocks...');

    this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      const { data: { request: { data: { blockHash, blockNumber } } } } = job;
      log(`Job onComplete block ${blockHash} ${blockNumber}`);
    });

    this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      const { data: { request, failed, state, createdOn } } = job;

      const dbEvent = await this._indexer.getEvent(request.data.id);
      assert(dbEvent);

      await this._indexer.updateBlockProgress(dbEvent.block.blockHash);
      const blockProgress = await this._indexer.getBlockProgress(dbEvent.block.blockHash);
      if (blockProgress && request.data.publishBlockProgress) {
        await this.publishBlockProgressToSubscribers(blockProgress);
      }

      const timeElapsedInSeconds = (Date.now() - Date.parse(createdOn)) / 1000;
      log(`Job onComplete event ${request.data.id} publish ${!!request.data.publish}`);
      if (!failed && state === 'completed' && request.data.publish) {
        // Check for max acceptable lag time between request and sending results to live subscribers.
        if (timeElapsedInSeconds <= this._jobQueue.maxCompletionLag) {
          return await this.publishUniswapEventToSubscribers(request.data.id, timeElapsedInSeconds);
        } else {
          log(`event ${request.data.id} is too old (${timeElapsedInSeconds}s), not broadcasting to live subscribers`);
        }
      }
    });

    this._subscription = await this._ethClient.watchBlocks(async (value) => {
      const { blockHash, blockNumber } = _.get(value, 'data.listen.relatedNode');
      log('watchBlock', blockHash, blockNumber);
      await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { blockHash, blockNumber });
    });
  }

  async publishUniswapEventToSubscribers (id: string, timeElapsedInSeconds: number): Promise<void> {
    const dbEvent = await this._indexer.getEvent(id);

    if (dbEvent && dbEvent.eventName !== UNKNOWN_EVENT_NAME) {
      const resultEvent = this._indexer.getResultEvent(dbEvent);

      log(`pushing event to GQL subscribers (${timeElapsedInSeconds}s elapsed): ${resultEvent.event.__typename}`);

      // Publishing the event here will result in pushing the payload to GQL subscribers for `onEvent`.
      await this._pubsub.publish(UniswapEvent, {
        onEvent: resultEvent
      });
    }
  }

  async publishBlockProgressToSubscribers (blockProgress: BlockProgress): Promise<void> {
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

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream blocks');
      this._subscription.unsubscribe();
    }
  }
}
