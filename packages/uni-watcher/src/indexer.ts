import debug from 'debug';
import { DeepPartial } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import assert from 'assert';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { GetStorageAt, getStorageValue, StorageLayout } from '@vulcanize/solidity-mapper';
import { Config } from '@vulcanize/util';

import { Database } from './database';
import { Event, UNKNOWN_EVENT_NAME } from './entity/Event';
import { BlockProgress } from './entity/BlockProgress';
import { Contract, KIND_FACTORY, KIND_POOL, KIND_NFPM } from './entity/Contract';

import { abi as factoryABI, storageLayout as factoryStorageLayout } from './artifacts/factory.json';
import { abi as nfpmABI, storageLayout as nfpmStorageLayout } from './artifacts/NonfungiblePositionManager.json';
import poolABI from './artifacts/pool.json';

// TODO: Move to config.
const MAX_EVENTS_BLOCK_RANGE = 1000;

const log = debug('vulcanize:indexer');

type ResultEvent = {
  block: any;
  tx: any;

  contract: string;

  eventIndex: number;
  event: any;

  proof: string;
};

interface ValueResult {
  value: any;
  proof: {
    data: string;
  }
}

export class Indexer {
  _config: Config;
  _db: Database
  _ethClient: EthClient
  _getStorageAt: GetStorageAt

  _factoryContract: ethers.utils.Interface
  _poolContract: ethers.utils.Interface
  _nfpmContract: ethers.utils.Interface

  constructor (config: Config, db: Database, ethClient: EthClient) {
    this._config = config;
    this._db = db;
    this._ethClient = ethClient;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);

    this._factoryContract = new ethers.utils.Interface(factoryABI);
    this._poolContract = new ethers.utils.Interface(poolABI);
    this._nfpmContract = new ethers.utils.Interface(nfpmABI);
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
      proof: JSON.parse(event.proof)
    };
  }

  // Note: Some event names might be unknown at this point, as earlier events might not yet be processed.
  async getOrFetchBlockEvents (blockHash: string): Promise<Array<Event>> {
    const blockProgress = await this._db.getBlockProgress(blockHash);
    if (!blockProgress) {
      // Fetch and save events first and make a note in the event sync progress table.
      await this.fetchAndSaveEvents(blockHash);
      log('getBlockEvents: db miss, fetching from upstream server');
    }

    const events = await this._db.getBlockEvents(blockHash);
    log(`getBlockEvents: db hit, num events: ${events.length}`);

    return events;
  }

  async getEventsByFilter (blockHash: string, contract: string, name: string | null): Promise<Array<Event>> {
    const uniContract = await this.isUniswapContract(contract);
    if (!uniContract) {
      throw new Error('Not a uniswap contract');
    }

    // Fetch block events first.
    await this.getOrFetchBlockEvents(blockHash);

    const events = await this._db.getEvents(blockHash, contract);
    log(`getEvents: db hit, num events: ${events.length}`);

    // Filtering.
    const result = events
      // TODO: Filter using db WHERE condition on contract.
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

  async isUniswapContract (address: string): Promise<Contract | undefined> {
    return this._db.getContract(ethers.utils.getAddress(address));
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    let eventName = UNKNOWN_EVENT_NAME;
    let eventInfo = {};

    const { topics, data } = logObj;

    switch (kind) {
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
      case KIND_NFPM: {
        const logDescription = this._nfpmContract.parseLog({ data, topics });
        switch (logDescription.name) {
          case 'IncreaseLiquidity': {
            eventName = logDescription.name;
            const { tokenId, liquidity, amount0, amount1 } = logDescription.args;

            eventInfo = {
              tokenId: tokenId.toString(),
              liquidity: liquidity.toString(),
              amount0: amount0.toString(),
              amount1: amount1.toString()
            };

            break;
          }
          case 'DecreaseLiquidity': {
            eventName = logDescription.name;
            const { tokenId, liquidity, amount0, amount1 } = logDescription.args;

            eventInfo = {
              tokenId: tokenId.toString(),
              liquidity: liquidity.toString(),
              amount0: amount0.toString(),
              amount1: amount1.toString()
            };

            break;
          }
          case 'Collect': {
            eventName = logDescription.name;
            const { tokenId, recipient, amount0, amount1 } = logDescription.args;

            eventInfo = {
              tokenId: tokenId.toString(),
              recipient,
              amount0: amount0.toString(),
              amount1: amount1.toString()
            };

            break;
          }
          case 'Transfer': {
            eventName = logDescription.name;
            const { from, to, tokenId } = logDescription.args;

            eventInfo = {
              from,
              to,
              tokenId: tokenId.toString()
            };

            break;
          }
        }

        break;
      }
    }

    return { eventName, eventInfo };
  }

  async fetchAndSaveEvents (blockHash: string): Promise<void> {
    const { block, logs } = await this._ethClient.getLogs({ blockHash });

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

      let eventName = UNKNOWN_EVENT_NAME;
      let eventInfo = {};
      const extraInfo = { topics, data };

      const contract = ethers.utils.getAddress(address);
      const uniContract = await this.isUniswapContract(contract);

      if (uniContract) {
        const eventDetails = this.parseEventNameAndArgs(uniContract.kind, logObj);
        eventName = eventDetails.eventName;
        eventInfo = eventDetails.eventInfo;
      }

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

    await this._db.saveEvents(blockHash, block.number, dbEvents);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._db.getEvent(id);
  }

  async saveEventEntity (dbEvent: Event): Promise<Event> {
    return this._db.saveEventEntity(dbEvent);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._db.getBlockProgress(blockHash);
  }

  async updateBlockProgress (blockHash: string): Promise<void> {
    return this._db.updateBlockProgress(blockHash);
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._db.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    if (toBlockNumber <= fromBlockNumber) {
      throw new Error('toBlockNumber should be greater than fromBlockNumber');
    }

    if ((toBlockNumber - fromBlockNumber) > MAX_EVENTS_BLOCK_RANGE) {
      throw new Error(`Max range (${MAX_EVENTS_BLOCK_RANGE}) exceeded`);
    }

    return this._db.getEventsInRange(fromBlockNumber, toBlockNumber);
  }

  async position (blockHash: string, tokenId: string) {
    const nfpmContract = await this._db.getLatestContract('nfpm');
    assert(nfpmContract, 'No NFPM contract watched.');
    const { value, proof } = await this._getStorageValue(nfpmStorageLayout, blockHash, nfpmContract.address, '_positions', BigInt(tokenId));

    return {
      ...value,
      proof
    };
  }

  async poolIdToPoolKey (blockHash: string, poolId: string) {
    const nfpmContract = await this._db.getLatestContract('nfpm');
    assert(nfpmContract, 'No NFPM contract watched.');
    const { value, proof } = await this._getStorageValue(nfpmStorageLayout, blockHash, nfpmContract.address, '_poolIdToPoolKey', BigInt(poolId));

    return {
      ...value,
      proof
    };
  }

  async getPool (blockHash: string, token0: string, token1: string, fee: string) {
    const factoryContract = await this._db.getLatestContract('factory');
    assert(factoryContract, 'No Factory contract watched.');
    const { value, proof } = await this._getStorageValue(factoryStorageLayout, blockHash, factoryContract.address, 'getPool', token0, token1, BigInt(fee));

    return {
      pool: value,
      proof
    };
  }

  // TODO: Move into base/class or framework package.
  async _getStorageValue (storageLayout: StorageLayout, blockHash: string, token: string, variable: string, ...mappingKeys: any[]): Promise<ValueResult> {
    return getStorageValue(
      storageLayout,
      this._getStorageAt,
      blockHash,
      token,
      variable,
      ...mappingKeys
    );
  }
}
