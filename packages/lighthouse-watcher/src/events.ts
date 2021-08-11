import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { Indexer, ResultEvent, UNKNOWN_EVENT_NAME } from './indexer';
const log = debug('vulcanize:events');

export const LighthouseEvent = 'lighthouse-event';

export class EventWatcher {
  _ethClient: EthClient
  _indexer: Indexer
  _subscription: ZenObservable.Subscription | undefined
  _pubsub: PubSub

  constructor (ethClient: EthClient, indexer: Indexer, pubsub: PubSub) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([LighthouseEvent]);
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');

    await this.watchBlocksAtChainHead();
  }

  async watchBlocksAtChainHead (): Promise<void> {
    log('Started watching upstream blocks...');
    this._subscription = await this._ethClient.watchBlocks(async (value) => {
      const { blockHash, blockNumber } = _.get(value, 'data.listen.relatedNode');
      log('watchBlock', blockHash, blockNumber);

      const events = await this._indexer.getOrFetchBlockEvents(blockHash);

      for (let ei = 0; ei < events.length; ei++) {
        await this.publishLighthouseEventToSubscribers(events[ei]);
      }
    });
  }

  async publishLighthouseEventToSubscribers (resultEvent: ResultEvent): Promise<void> {
    if (resultEvent.event.__typename !== UNKNOWN_EVENT_NAME) {
      log(`pushing event to GQL subscribers: ${resultEvent.event.__typename}`);

      // Publishing the event here will result in pushing the payload to GQL subscribers for `onEvent`.
      await this._pubsub.publish(LighthouseEvent, {
        onEvent: resultEvent
      });
    }
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream blocks');
      this._subscription.unsubscribe();
    }
  }
}
