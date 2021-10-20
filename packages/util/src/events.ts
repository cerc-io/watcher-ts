//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';
import _ from 'lodash';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { JobQueue } from './job-queue';
import { BlockProgressInterface, EventInterface, IndexerInterface } from './types';
import { QUEUE_BLOCK_PROCESSING, MAX_REORG_DEPTH, JOB_KIND_PRUNE, JOB_KIND_INDEX } from './constants';
import { createPruningJob } from './common';

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

  async blocksHandler (value: any): Promise<void> {
    const { blockHash, blockNumber, parentHash, timestamp } = _.get(value, 'data.listen.relatedNode');

    await this._indexer.updateSyncStatusChainHead(blockHash, blockNumber);

    log('watchBlock', blockHash, blockNumber);

    await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { kind: JOB_KIND_INDEX, blockHash, blockNumber, parentHash, timestamp });
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

  async eventProcessingCompleteHandler (job: any): Promise<EventInterface> {
    const { data: { request } } = job;

    const dbEvent = await this._indexer.getEvent(request.data.id);
    assert(dbEvent);

    await this._indexer.updateBlockProgress(dbEvent.block.blockHash, dbEvent.index);
    const blockProgress = await this._indexer.getBlockProgress(dbEvent.block.blockHash);

    if (blockProgress) {
      await this.publishBlockProgressToSubscribers(blockProgress);

      if (blockProgress.isComplete) {
        await this._indexer.removeUnknownEvents(blockProgress);
      }
    }

    return dbEvent;
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

    // Update sync progress.
    const syncStatus = await this._indexer.updateSyncStatusIndexedBlock(blockHash, blockNumber);

    // Create pruning job if required.
    if (syncStatus && syncStatus.latestIndexedBlockNumber > (syncStatus.latestCanonicalBlockNumber + MAX_REORG_DEPTH)) {
      await createPruningJob(this._jobQueue, syncStatus.latestCanonicalBlockNumber, priority);
    }

    // Publish block progress event.
    const blockProgress = await this._indexer.getBlockProgress(blockHash);
    if (blockProgress) {
      await this.publishBlockProgressToSubscribers(blockProgress);
    }
  }

  async _handlePruningComplete (jobData: any): Promise<void> {
    const { pruneBlockHeight } = jobData;
    log(`Job onComplete pruning at height ${pruneBlockHeight}`);

    const blocks = await this._indexer.getBlocksAtHeight(pruneBlockHeight, false);

    // Only one canonical (not pruned) block should exist at the pruned height.
    assert(blocks.length === 1);
    const [block] = blocks;

    await this._indexer.updateSyncStatusCanonicalBlock(block.blockHash, block.blockNumber);
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream blocks');
      this._subscription.unsubscribe();
    }
  }
}
