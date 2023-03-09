//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'graphql-subscriptions';

import { EthClient } from '@cerc-io/ipld-eth-client';
import { JobQueue } from '@cerc-io/util';

import { Indexer } from './indexer';
import { BlockProgress } from './entity/BlockProgress';

const log = debug('vulcanize:tx-watcher');

export const AddressEvent = 'address-event';
export const BlockProgressEvent = 'block-progress-event';
export const QUEUE_TX_TRACING = 'tx-tracing';

export class TxWatcher {
  _ethClient: EthClient;
  _indexer: Indexer;
  _pubsub: PubSub;
  _watchTxSubscription: ZenObservable.Subscription | undefined;
  _jobQueue: JobQueue;

  constructor (ethClient: EthClient, indexer: Indexer, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
  }

  getAddressEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([AddressEvent]);
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([BlockProgressEvent]);
  }

  async start (): Promise<void> {
    assert(!this._watchTxSubscription, 'subscription already started');

    log('Started watching upstream tx...');

    this._jobQueue.onComplete(QUEUE_TX_TRACING, async (job) => {
      const { data: { request, failed, state, createdOn } } = job;

      await this._indexer.updateBlockProgress(request.data.blockHash);
      const blockProgress = await this._indexer.getBlockProgress(request.data.blockHash);
      if (blockProgress && request.data.publishBlockProgress) {
        await this.publishBlockProgressToSubscribers(blockProgress);
      }

      const timeElapsedInSeconds = (Date.now() - Date.parse(createdOn)) / 1000;
      log(`Job onComplete tx ${request.data.txHash} publish ${!!request.data.publish}`);
      if (!failed && state === 'completed' && request.data.publish) {
        // Check for max acceptable lag time between tracing request and sending results to live subscribers.
        if (timeElapsedInSeconds <= this._jobQueue.maxCompletionLag) {
          return await this.publishAddressEventToSubscribers(request.data.txHash, timeElapsedInSeconds);
        } else {
          log(`tx ${request.data.txHash} is too old (${timeElapsedInSeconds}s), not broadcasting to live subscribers`);
        }
      }
    });

    // TODO: Update to pull based watcher.
    // this._watchTxSubscription = await this._ethClient.watchTransactions(async (value) => {
    //   const { txHash, ethHeaderCidByHeaderId: { blockHash, blockNumber } } = _.get(value, 'data.listen.relatedNode');
    //   log('watchTransaction', JSON.stringify({ txHash, blockHash, blockNumber }, null, 2));
    //   await this._jobQueue.pushJob(QUEUE_TX_TRACING, { txHash, blockHash, publish: true });
    // });
  }

  async publishAddressEventToSubscribers (txHash: string, timeElapsedInSeconds: number): Promise<void> {
    const traceObj = await this._indexer.getTrace(txHash);
    if (!traceObj) {
      return;
    }

    const { blockNumber, blockHash, trace } = traceObj;

    for (let i = 0; i < traceObj.accounts.length; i++) {
      const account = traceObj.accounts[i];

      log(`publishing trace for ${txHash} (${timeElapsedInSeconds}s elapsed) to GQL subscribers for address ${account.address}`);

      // Publishing the event here will result in pushing the payload to GQL subscribers for `onAddressEvent(address)`.
      await this._pubsub.publish(AddressEvent, {
        onAddressEvent: {
          address: account.address,
          txTrace: {
            txHash,
            blockHash,
            blockNumber,
            trace
          }
        }
      });
    }
  }

  async publishBlockProgressToSubscribers (blockProgress: BlockProgress): Promise<void> {
    const { blockHash, blockNumber, numTx, numTracedTx, isComplete } = blockProgress;

    // Publishing the event here will result in pushing the payload to GQL subscribers for `onAddressEvent(address)`.
    await this._pubsub.publish(BlockProgressEvent, {
      onBlockProgressEvent: {
        blockHash,
        blockNumber,
        numTx,
        numTracedTx,
        isComplete
      }
    });
  }

  async stop (): Promise<void> {
    if (this._watchTxSubscription) {
      log('Stopped watching upstream tx');
      this._watchTxSubscription.unsubscribe();
    }
  }
}
