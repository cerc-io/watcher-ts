import assert from 'assert';
import debug from 'debug';
import { invert } from 'lodash';
import { DeepPartial } from 'typeorm';
import JSONbig from 'json-bigint';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import {
  GetStorageAt
  // StorageLayout
} from '@vulcanize/solidity-mapper';

import { Database } from './database';
import { Event } from './entity/Event';

const log = debug('vulcanize:indexer');

export interface ValueResult {
  value: string | bigint;
  proof: {
    data: string;
  }
}

export interface BlockHeight {
  number: number;
  hash: string;
}

type EventsResult = Array<{
  event: {
    from?: string;
    to?: string;
    owner?: string;
    spender?: string;
    value?: BigInt;
    __typename: string;
  }
  proof: string;
}>

export class Indexer {
  _db: Database
  _ethClient: EthClient
  _pubsub: PubSub
  _getStorageAt: GetStorageAt

  // _abi: JsonFragment[]
  // _storageLayout: StorageLayout
  // _contract: ethers.utils.Interface

  constructor (db: Database, ethClient: EthClient, pubsub: PubSub) {
    assert(db);
    assert(ethClient);
    assert(pubsub);

    // const { abi, storageLayout } = artifacts;

    // assert(abi);
    // assert(storageLayout);

    this._db = db;
    this._ethClient = ethClient;
    this._pubsub = pubsub;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);

    // this._abi = abi;
    // this._storageLayout = storageLayout;

    // this._contract = new ethers.utils.Interface(this._abi);
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator(['event']);
  }

  async getEvents (blockHash: string, token: string, name: string | null): Promise<EventsResult> {
    const didSyncEvents = await this._db.didSyncEvents({ blockHash, token });
    if (!didSyncEvents) {
      // Fetch and save events first and make a note in the event sync progress table.
      await this._fetchAndSaveEvents({ blockHash, token });
      log('getEvents: db miss, fetching from upstream server');
    }

    assert(await this._db.didSyncEvents({ blockHash, token }));

    const events = await this._db.getEvents({ blockHash, token });
    log('getEvents: db hit');

    const result = events
      // TODO: Filter using db WHERE condition when name is not empty.
      .filter(event => !name || name === event.eventName)
      .map(e => {
        const eventFields: {
          from?: string,
          to?: string,
          value?: BigInt,
          owner?: string,
          spender?: string,
        } = {};

        // switch (e.eventName) {
        //   // TODO: Handle events.
        // }

        return {
          event: {
            __typename: `${e.eventName}Event`,
            ...eventFields
          },
          // TODO: Return proof only if requested.
          proof: JSON.parse(e.proof)
        };
      });

    // log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async triggerIndexingOnEvent (blockHash: string, token: string, receipt: any, logIndex: number): Promise<void> {
    const topics = [];

    // We only care about the event type for now.
    // const data = '0x0000000000000000000000000000000000000000000000000000000000000000';

    topics.push(receipt.topic0S[logIndex]);
    topics.push(receipt.topic1S[logIndex]);
    topics.push(receipt.topic2S[logIndex]);

    // const { name: eventName, args } = this._contract.parseLog({ topics, data });
    // log(`trigger indexing on event: ${eventName} ${args}`);

    // What data we index depends on the kind of event.
    // switch (eventName) {
    // TODO: Index event.
    // }
  }

  async publishEventToSubscribers (blockHash: string, token: string, logIndex: number): Promise<void> {
    // TODO: Optimize this fetching of events.
    const events = await this.getEvents(blockHash, token, null);
    const event = events[logIndex];

    log(`pushing event to GQL subscribers: ${event.event.__typename}`);

    // Publishing the event here will result in pushing the payload to GQL subscribers for `onTokenEvent`.
    await this._pubsub.publish('event', {
      onTokenEvent: {
        blockHash,
        token,
        event
      }
    });
  }

  async isUniswapContract (address: string): Promise<boolean> {
    // TODO: Return true for uniswap contracts of interest to the indexer (from config?).
    return address != null;
  }

  async processEvent (blockHash: string, token: string, receipt: any, logIndex: number): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(blockHash, token, receipt, logIndex);

    // Also trigger downstream event watcher subscriptions.
    await this.publishEventToSubscribers(blockHash, token, logIndex);
  }

  // TODO: Move into base/class or framework package.
  async _getStorageValue (
  // blockHash: string,
  // token: string,
  // variable: string,
  // ...mappingKeys: string[]
  ): Promise<ValueResult> {
    return {
      value: '',
      proof: {
        data: ''
      }
    };

    // return getStorageValue(
    //   this._storageLayout,
    //   this._getStorageAt,
    //   blockHash,
    //   token,
    //   variable,
    //   ...mappingKeys
    // );
  }

  async _fetchAndSaveEvents ({ blockHash, token }: { blockHash: string, token: string }): Promise<void> {
    const logs = await this._ethClient.getLogs({ blockHash, contract: token });

    const eventNameToTopic = {}; // getEventNameTopics(this._abi);
    const logTopicToEventName = invert(eventNameToTopic);

    const dbEvents = logs.map((log: any) => {
      const { topics, cid, ipldBlock } = log;

      const [topic0] = topics;

      const eventName = logTopicToEventName[topic0];

      const event: DeepPartial<Event> = {
        blockHash,
        token,
        eventName,

        proof: JSONbig.stringify({
          data: JSONbig.stringify({
            blockHash,
            receipt: {
              cid,
              ipldBlock
            }
          })
        })
      };

      // switch (eventName) {
      //   // TODO: Handle event.
      // }

      return event;
    });

    await this._db.saveEvents({ blockHash, token, events: dbEvents });
  }
}
