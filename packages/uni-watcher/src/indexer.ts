import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';
import { DeepPartial } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { GetStorageAt } from '@vulcanize/solidity-mapper';

import { Database } from './database';
import { Event } from './entity/Event';
import { Config } from './config';

import factoryABI from './artifacts/factory.json';

const log = debug('vulcanize:indexer');

type EventsResult = Array<{
  event: any;
  proof: string;
}>

export class Indexer {
  _config: Config;
  _db: Database
  _ethClient: EthClient
  _pubsub: PubSub
  _getStorageAt: GetStorageAt

  _factoryContract: ethers.utils.Interface

  constructor (config: Config, db: Database, ethClient: EthClient, pubsub: PubSub) {
    assert(config);
    assert(db);
    assert(ethClient);
    assert(pubsub);

    this._config = config;
    this._db = db;
    this._ethClient = ethClient;
    this._pubsub = pubsub;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);

    this._factoryContract = new ethers.utils.Interface(factoryABI);
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator(['event']);
  }

  async getEvents (blockHash: string, contract: string, name: string | null): Promise<EventsResult> {
    const didSyncEvents = await this._db.didSyncEvents({ blockHash, contract });
    if (!didSyncEvents) {
      // Fetch and save events first and make a note in the event sync progress table.
      await this._fetchAndSaveEvents({ blockHash, contract });
      log('getEvents: db miss, fetching from upstream server');
    }

    assert(await this._db.didSyncEvents({ blockHash, contract }));

    const events = await this._db.getEvents({ blockHash, contract });
    log(`getEvents: db hit, num events: ${events.length}`);

    const result = events
      // TODO: Filter using db WHERE condition when name is not empty.
      .filter(event => !name || name === event.eventName)
      .map(e => {
        const eventFields = JSON.parse(e.eventData);

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

  /* eslint-disable */
  async triggerIndexingOnEvent (blockHash: string, contract: string, receipt: any, logIndex: number): Promise<void> {

  }
  /* eslint-enable */

  async publishEventToSubscribers (blockHash: string, contract: string, logIndex: number): Promise<void> {
    // TODO: Optimize this fetching of events.
    const events = await this.getEvents(blockHash, contract, null);

    log(JSON.stringify(events, null, 2));
    log(logIndex);

    const event = events[logIndex];

    log(`pushing event to GQL subscribers: ${event.event.__typename}`);

    // Publishing the event here will result in pushing the payload to GQL subscribers for `onEvent`.
    await this._pubsub.publish('event', {
      onEvent: {
        blockHash,
        contract,
        event
      }
    });
  }

  async isUniswapContract (address: string): Promise<boolean> {
    // TODO: Return true for uniswap contracts of interest to the indexer (from config?).
    return address != null;
  }

  async processEvent (blockHash: string, contract: string, receipt: any, logIndex: number): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(blockHash, contract, receipt, logIndex);

    // Also trigger downstream event watcher subscriptions.
    await this.publishEventToSubscribers(blockHash, contract, logIndex);
  }

  async _fetchAndSaveEvents ({ blockHash, contract }: { blockHash: string, contract: string }): Promise<void> {
    const logs = await this._ethClient.getLogs({ blockHash, contract });

    const dbEvents = logs.map((logObj: any) => {
      const { topics, data, cid, ipldBlock } = logObj;

      let eventName;
      let eventProps = {};

      // TODO: Get contract kind from contracts table.
      if (contract === this._config.contracts.factory) {
        const logDescription = this._factoryContract.parseLog({ data, topics });
        const { token0, token1, fee, tickSpacing, pool } = logDescription.args;

        eventName = logDescription.name;
        eventProps = { token0, token1, fee, tickSpacing, pool };
      }

      let event: DeepPartial<Event> | undefined;
      if (eventName) {
        event = {
          blockHash,
          contract,
          eventName,
          eventData: JSONbig.stringify({ ...eventProps }),
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
      }

      return event;
    });

    const events: DeepPartial<Event>[] = _.compact(dbEvents);
    await this._db.saveEvents({ blockHash, contract, events });
  }
}
