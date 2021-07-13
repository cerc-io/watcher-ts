import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';
import { DeepPartial } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { GetStorageAt } from '@vulcanize/solidity-mapper';
import { Config } from '@vulcanize/util';

import { Database } from './database';
import { Event } from './entity/Event';
import { Contract, KIND_FACTORY, KIND_POOL } from './entity/Contract';

import factoryABI from './artifacts/factory.json';
import poolABI from './artifacts/pool.json';

const log = debug('vulcanize:indexer');

type ResultEvent = {
  block: any;
  tx: any;

  contract: string;

  eventIndex: number;
  event: any;

  proof: string;
};

export class Indexer {
  _config: Config;
  _db: Database
  _ethClient: EthClient
  _pubsub: PubSub
  _getStorageAt: GetStorageAt

  _factoryContract: ethers.utils.Interface
  _poolContract: ethers.utils.Interface

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
    this._poolContract = new ethers.utils.Interface(poolABI);
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator(['event']);
  }

  async getBlockEvents (blockHash: string): Promise<Array<Event>> {
    const didSyncEvents = await this._db.didSyncEvents({ blockHash });
    if (!didSyncEvents) {
      // Fetch and save events first and make a note in the event sync progress table.
      await this.fetchAndSaveEvents({ blockHash });
      log('getEvents: db miss, fetching from upstream server');
    }

    assert(await this._db.didSyncEvents({ blockHash }));

    const events = await this._db.getBlockEvents({ blockHash });
    log(`getEvents: db hit, num events: ${events.length}`);

    return events;
  }

  getResultEvent (event: Event): ResultEvent {
    const eventFields = JSON.parse(event.eventInfo);

    return {
      block: {
        hash: event.blockHash,
        number: event.blockNumber,
        timestamp: event.blockTimestamp
      },

      tx: {
        hash: event.txHash
      },

      contract: event.contract,

      eventIndex: event.index,
      event: {
        __typename: `${event.eventName}Event`,
        ...eventFields
      },

      // TODO: Return proof only if requested.
      proof: JSON.parse(event.proof),
    };
  }

  async getEvents (blockHash: string, contract: string, name: string | null): Promise<Array<Event>> {
    const uniContract = await this.isUniswapContract(contract);
    if (!uniContract) {
      throw new Error('Not a uniswap contract');
    }

    const didSyncEvents = await this._db.didSyncEvents({ blockHash });
    if (!didSyncEvents) {
      // Fetch and save events first and make a note in the event sync progress table.
      await this.fetchAndSaveEvents({ blockHash });
      log('getEvents: db miss, fetching from upstream server');
    }

    assert(await this._db.didSyncEvents({ blockHash }));

    const events = await this._db.getEvents({ blockHash, contract });
    log(`getEvents: db hit, num events: ${events.length}`);

    const result = events
      .filter(event => contract === event.contract)
      // TODO: Filter using db WHERE condition when name is not empty.
      .filter(event => !name || name === event.eventName);

    return result;
  }

  async triggerIndexingOnEvent (dbEvent: Event): Promise<void> {
    const re = this.getResultEvent(dbEvent);

    switch (re.event.__typename) {
      case 'PoolCreatedEvent': {
        const poolContract = ethers.utils.getAddress(re.event.pool);
        await this._db.saveContract(poolContract, KIND_POOL, dbEvent.blockNumber);
      }
    }
  }

  async publishEventToSubscribers (dbEvent: Event): Promise<void> {
    const resultEvent = this.getResultEvent(dbEvent);

    log(`pushing event to GQL subscribers: ${resultEvent.event.__typename}`);

    // Publishing the event here will result in pushing the payload to GQL subscribers for `onEvent`.
    await this._pubsub.publish('event', {
      onEvent: resultEvent
    });
  }

  async isUniswapContract (address: string): Promise<Contract | undefined> {
    return this._db.getContract(ethers.utils.getAddress(address));
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);

    // Also trigger downstream event watcher subscriptions.
    await this.publishEventToSubscribers(event);
  }

  async fetchAndSaveEvents ({ blockHash }: { blockHash: string }): Promise<void> {
    const logs = await this._ethClient.getLogs({ blockHash });

    const dbEvents: Array<DeepPartial<Event>> = [];

    for (let li = 0; li < logs.length; li++) {
      const logObj = logs[li];
      const {
        topics,
        data,
        index: logIndex,
        cid,
        ipldBlock,
        account: {
          address
        },
        transaction: {
          hash: txHash,
          block: {
            number: blockNumber,
            timestamp: blockTimestamp
          }
        }
      } = logObj;

      let eventName;
      let eventInfo = {};
      let extraInfo = {};

      const contract = ethers.utils.getAddress(address);
      const uniContract = await this.isUniswapContract(contract);
      if (!uniContract) {
        // TODO: Can only be known if events are processed serially.
        continue;
      }

      switch (uniContract.kind) {
        case KIND_FACTORY: {
          const logDescription = this._factoryContract.parseLog({ data, topics });
          switch (logDescription.name) {
            case 'PoolCreated': {
              eventName = logDescription.name;
              const { token0, token1, fee, tickSpacing, pool } = logDescription.args;
              eventInfo = { token0, token1, fee, tickSpacing, pool };

              break;
            }
          }

          break;
        }
        case KIND_POOL: {
          const logDescription = this._poolContract.parseLog({ data, topics });
          switch (logDescription.name) {
            case 'Initialize': {
              eventName = logDescription.name;
              const { sqrtPriceX96, tick } = logDescription.args;
              eventInfo = { sqrtPriceX96: sqrtPriceX96.toString(), tick };

              break;
            }
            case 'Mint': {
              eventName = logDescription.name;
              const { sender, owner, tickLower, tickUpper, amount, amount0, amount1 } = logDescription.args;
              eventInfo = {
                sender,
                owner,
                tickLower,
                tickUpper,
                amount: amount.toString(),
                amount0: amount0.toString(),
                amount1: amount1.toString()
              };

              break;
            }
            case 'Burn': {
              eventName = logDescription.name;
              const { owner, tickLower, tickUpper, amount, amount0, amount1 } = logDescription.args;
              eventInfo = {
                owner,
                tickLower,
                tickUpper,
                amount: amount.toString(),
                amount0: amount0.toString(),
                amount1: amount1.toString()
              };

              break;
            }
            case 'Swap': {
              eventName = logDescription.name;
              const { sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick } = logDescription.args;
              eventInfo = {
                sender,
                recipient,
                amount0: amount0.toString(),
                amount1: amount1.toString(),
                sqrtPriceX96: sqrtPriceX96.toString(),
                liquidity: liquidity.toString(),
                tick
              };

              break;
            }
          }

          break;
        }
      }

      if (eventName) {
        dbEvents.push({
          blockHash,
          blockNumber,
          blockTimestamp,
          index: logIndex,
          txHash,
          contract,
          eventName,
          eventInfo: JSONbig.stringify(eventInfo),
          extraInfo: JSONbig.stringify(extraInfo),
          proof: JSONbig.stringify({
            data: JSONbig.stringify({
              blockHash,
              receipt: {
                cid,
                ipldBlock
              }
            })
          })
        });
      }
    }

    const events: DeepPartial<Event>[] = _.compact(dbEvents);
    await this._db.saveEvents({ blockHash, events });
  }
}
