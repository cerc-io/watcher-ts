import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { Indexer } from './indexer';
import { JobQueue } from './job-queue';

const log = debug('vulcanize:tx-watcher');

export const AddressEvent = 'address-event';
export const QUEUE_TX_TRACING = 'tx-tracing';

export class TxWatcher {
  _ethClient: EthClient
  _indexer: Indexer
  _pubsub: PubSub
  _watchTxSubscription: ZenObservable.Subscription | undefined
  _jobQueue: JobQueue

  constructor (ethClient: EthClient, indexer: Indexer, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
  }

  getAddressEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([AddressEvent]);
  }

  async start (): Promise<void> {
    assert(!this._watchTxSubscription, 'subscription already started');

    log('Started watching upstream tx...');

    this._jobQueue.onComplete(QUEUE_TX_TRACING, async (job) => {
      const { data: { request, failed, state, createdOn } } = job;
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

    this._watchTxSubscription = await this._ethClient.watchTransactions(async (value) => {
      const { txHash, ethHeaderCidByHeaderId: { blockHash, blockNumber } } = _.get(value, 'data.listen.relatedNode');
      log('watchTransaction', JSON.stringify({ txHash, blockHash, blockNumber }, null, 2));
      await this._jobQueue.pushJob(QUEUE_TX_TRACING, { txHash, publish: true });
    });
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

  async stop (): Promise<void> {
    if (this._watchTxSubscription) {
      log('Stopped watching upstream tx');
      this._watchTxSubscription.unsubscribe();
    }
  }
}
