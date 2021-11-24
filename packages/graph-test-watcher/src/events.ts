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
  EventWatcherInterface,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  QUEUE_BLOCK_CHECKPOINT,
  QUEUE_HOOKS,
  QUEUE_IPFS,
  UNKNOWN_EVENT_NAME,
  UpstreamConfig,
  JOB_KIND_PRUNE
} from '@vulcanize/util';

import { Indexer } from './indexer';
import { Event } from './entity/Event';

const EVENT = 'event';

const log = debug('vulcanize:events');

export class EventWatcher implements EventWatcherInterface {
  _ethClient: EthClient
  _indexer: Indexer
  _subscription: ZenObservable.Subscription | undefined
  _baseEventWatcher: BaseEventWatcher
  _pubsub: PubSub
  _jobQueue: JobQueue

  constructor (upstreamConfig: UpstreamConfig, ethClient: EthClient, postgraphileClient: EthClient, indexer: Indexer, pubsub: PubSub, jobQueue: JobQueue) {
    assert(ethClient);
    assert(indexer);

    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
    this._baseEventWatcher = new BaseEventWatcher(upstreamConfig, this._ethClient, postgraphileClient, this._indexer, this._pubsub, this._jobQueue);
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([EVENT]);
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._baseEventWatcher.getBlockProgressEventIterator();
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');

    await this.initBlockProcessingOnCompleteHandler();
    await this.initEventProcessingOnCompleteHandler();
    await this.initHooksOnCompleteHandler();
    await this.initBlockCheckpointOnCompleteHandler();
    this._baseEventWatcher.startBlockProcessing();
  }

  async stop (): Promise<void> {
    this._baseEventWatcher.stop();
  }

  async initBlockProcessingOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      const { id, data: { failed, request: { data: { kind } } } } = job;

      if (failed) {
        log(`Job ${id} for queue ${QUEUE_BLOCK_PROCESSING} failed`);
        return;
      }

      await this._baseEventWatcher.blockProcessingCompleteHandler(job);

      await this.createHooksJob(kind);
    });
  }

  async initEventProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      const { id, data: { request, failed, state, createdOn } } = job;

      if (failed) {
        log(`Job ${id} for queue ${QUEUE_EVENT_PROCESSING} failed`);
        return;
      }

      const dbEvent = await this._baseEventWatcher.eventProcessingCompleteHandler(job);

      const timeElapsedInSeconds = (Date.now() - Date.parse(createdOn)) / 1000;
      log(`Job onComplete event ${request.data.id} publish ${!!request.data.publish}`);
      if (!failed && state === 'completed' && request.data.publish) {
        // Check for max acceptable lag time between request and sending results to live subscribers.
        if (timeElapsedInSeconds <= this._jobQueue.maxCompletionLag) {
          await this.publishEventToSubscribers(dbEvent, timeElapsedInSeconds);
        } else {
          log(`event ${request.data.id} is too old (${timeElapsedInSeconds}s), not broadcasting to live subscribers`);
        }
      }
    });
  }

  async initHooksOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_HOOKS, async (job) => {
      const { data: { request: { data: { blockNumber, blockHash } } } } = job;

      await this._indexer.updateHookStatusProcessedBlock(blockNumber);

      // Create a checkpoint job after completion of a hook job.
      await this.createCheckpointJob(blockHash, blockNumber);
    });
  }

  async initBlockCheckpointOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_BLOCK_CHECKPOINT, async (job) => {
      const { data: { request: { data: { blockHash } } } } = job;

      if (this._indexer.isIPFSConfigured()) {
        await this.createIPFSPutJob(blockHash);
      }
    });
  }

  async publishEventToSubscribers (dbEvent: Event, timeElapsedInSeconds: number): Promise<void> {
    if (dbEvent && dbEvent.eventName !== UNKNOWN_EVENT_NAME) {
      const resultEvent = this._indexer.getResultEvent(dbEvent);

      log(`pushing event to GQL subscribers (${timeElapsedInSeconds}s elapsed): ${resultEvent.event.__typename}`);

      // Publishing the event here will result in pushing the payload to GQL subscribers for `onEvent`.
      await this._pubsub.publish(EVENT, {
        onEvent: resultEvent
      });
    }
  }

  async createHooksJob (kind: string): Promise<void> {
    // If it's a pruning job: Create a hook job for the latest canonical block.
    if (kind === JOB_KIND_PRUNE) {
      const latestCanonicalBlock = await this._indexer.getLatestCanonicalBlock();

      await this._jobQueue.pushJob(
        QUEUE_HOOKS,
        {
          blockHash: latestCanonicalBlock.blockHash,
          blockNumber: latestCanonicalBlock.blockNumber
        }
      );
    }
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

  async createIPFSPutJob (blockHash: string): Promise<void> {
    const ipldBlocks = await this._indexer.getIPLDBlocksByHash(blockHash);

    for (const ipldBlock of ipldBlocks) {
      const data = this._indexer.getIPLDData(ipldBlock);

      await this._jobQueue.pushJob(QUEUE_IPFS, { data });
    }
  }
}
