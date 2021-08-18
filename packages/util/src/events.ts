//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { JobQueue } from './job-queue';
import { BlockProgressInterface, EventInterface, IndexerInterface } from './types';

const log = debug('vulcanize:events');

export const BlockProgressEvent = 'block-progress-event';

export class EventWatcher {
  _ethClient: EthClient
  _indexer: IndexerInterface
  _subscription?: ZenObservable.Subscription
  _pubsub: PubSub
  _jobQueue: JobQueue

  constructor (ethClient: EthClient, indexer: IndexerInterface, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([BlockProgressEvent]);
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

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream blocks');
      this._subscription.unsubscribe();
    }
  }

  async eventProcessingCompleteHandler (job: any): Promise<EventInterface> {
    const { data: { request } } = job;

    const dbEvent = await this._indexer.getEvent(request.data.id);
    assert(dbEvent);

    await this._indexer.updateBlockProgress(dbEvent.block.blockHash, dbEvent.index);
    const blockProgress = await this._indexer.getBlockProgress(dbEvent.block.blockHash);
    if (blockProgress) {
      await this.publishBlockProgressToSubscribers(blockProgress);
    }

    return dbEvent;
  }
}
