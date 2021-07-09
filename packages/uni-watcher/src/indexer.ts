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

type EventResult = {
  event: any;
  proof: string;
};

type EventsResult = Array<EventResult>;

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

  async getEvents (blockHash: string, contract: string, name: string | null): Promise<EventsResult> {
    const uniContract = await this.isUniswapContract(contract);
    if (!uniContract) {
      throw new Error('Not a uniswap contract');
    }

    const didSyncEvents = await this._db.didSyncEvents({ blockHash, contract });
    if (!didSyncEvents) {
      // Fetch and save events first and make a note in the event sync progress table.
      await this._fetchAndSaveEvents({ blockHash, contract, uniContract });
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

  async triggerIndexingOnEvent (blockNumber: number, event: EventResult): Promise<void> {
    switch (event.event.__typename) {
      case 'PoolCreatedEvent': {
        const poolContract = ethers.utils.getAddress(event.event.pool);
        await this._db.saveContract(poolContract, KIND_POOL, blockNumber);
      }
    }
  }

  async publishEventToSubscribers (blockHash: string, blockNumber: number, contract: string, txHash: string, event: EventResult): Promise<void> {
    log(`pushing event to GQL subscribers: ${event.event.__typename}`);

    // Publishing the event here will result in pushing the payload to GQL subscribers for `onEvent`.
    await this._pubsub.publish('event', {
      onEvent: {
        blockHash,
        blockNumber,
        contract,
        txHash,
        event
      }
    });
  }

  async isUniswapContract (address: string): Promise<Contract | undefined> {
    return this._db.getContract(ethers.utils.getAddress(address));
  }

  async processEvent (blockHash: string, blockNumber: number, contract: Contract, txHash: string, receipt: any, event: EventResult): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(blockNumber, event);

    // Also trigger downstream event watcher subscriptions.
    await this.publishEventToSubscribers(blockHash, blockNumber, contract.address, txHash, event);
  }

  async _fetchAndSaveEvents ({ blockHash, contract, uniContract }: { blockHash: string, contract: string, uniContract: Contract }): Promise<void> {
    assert(uniContract);

    const logs = await this._ethClient.getLogs({ blockHash, contract });

    const dbEvents = logs.map((logObj: any) => {
      const { topics, data, cid, ipldBlock } = logObj;

      let eventName;
      let eventProps = {};

      switch (uniContract.kind) {
        case KIND_FACTORY: {
          const logDescription = this._factoryContract.parseLog({ data, topics });
          switch (logDescription.name) {
            case 'PoolCreated': {
              eventName = logDescription.name;
              const { token0, token1, fee, tickSpacing, pool } = logDescription.args;
              eventProps = { token0, token1, fee, tickSpacing, pool };

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
              eventProps = { sqrtPriceX96: sqrtPriceX96.toString(), tick };

              break;
            }
            case 'Mint': {
              eventName = logDescription.name;
              const { sender, owner, tickLower, tickUpper, amount, amount0, amount1 } = logDescription.args;
              eventProps = {
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
              eventProps = {
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
              eventProps = {
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
