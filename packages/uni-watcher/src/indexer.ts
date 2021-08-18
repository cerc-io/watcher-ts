//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import { DeepPartial, QueryRunner } from 'typeorm';
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
import { SyncStatus } from './entity/SyncStatus';

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
  _postgraphileClient: EthClient
  _getStorageAt: GetStorageAt

  _factoryContract: ethers.utils.Interface
  _poolContract: ethers.utils.Interface
  _nfpmContract: ethers.utils.Interface

  constructor (config: Config, db: Database, ethClient: EthClient, postgraphileClient: EthClient) {
    this._config = config;
    this._db = db;
    this._ethClient = ethClient;
    this._postgraphileClient = postgraphileClient;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);

    this._factoryContract = new ethers.utils.Interface(factoryABI);
    this._poolContract = new ethers.utils.Interface(poolABI);
    this._nfpmContract = new ethers.utils.Interface(nfpmABI);
  }

  getResultEvent (event: Event): ResultEvent {
    const block = event.block;
    const eventFields = JSON.parse(event.eventInfo);
    const { tx } = JSON.parse(event.extraInfo);

    return {
      block: {
        hash: block.blockHash,
        number: block.blockNumber,
        timestamp: block.blockTimestamp,
        parentHash: block.parentHash
      },

      tx: {
        hash: event.txHash,
        from: tx.src,
        to: tx.dst,
        index: tx.index
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
  async getOrFetchBlockEvents (block: DeepPartial<BlockProgress>): Promise<Array<Event>> {
    assert(block.blockHash);
    const blockProgress = await this._db.getBlockProgress(block.blockHash);
    if (!blockProgress) {
      // Fetch and save events first and make a note in the event sync progress table.
      log(`getBlockEvents: db miss, fetching from upstream server ${block.blockHash}`);
      await this.fetchAndSaveEvents(block);
    }

    const events = await this._db.getBlockEvents(block.blockHash);
    log(`getBlockEvents: db hit, ${block.blockHash} num events: ${events.length}`);

    return events;
  }

  async getBlockEvents (blockHash: string): Promise<Array<Event>> {
    return this._db.getBlockEvents(blockHash);
  }

  async getEventsByFilter (blockHash: string, contract: string, name: string | null): Promise<Array<Event>> {
    if (contract) {
      const uniContract = await this.isUniswapContract(contract);
      if (!uniContract) {
        throw new Error('Not a uniswap contract');
      }
    }

    const events = await this._db.getBlockEvents(blockHash);
    log(`getEvents: db hit, num events: ${events.length}`);

    // Filtering.
    const result = events
      // TODO: Filter using db WHERE condition on contract.
      .filter(event => !contract || contract === event.contract)
      // TODO: Filter using db WHERE condition when name is not empty.
      .filter(event => !name || name === event.eventName);

    return result;
  }

  async triggerIndexingOnEvent (dbTx: QueryRunner, dbEvent: Event): Promise<void> {
    const re = this.getResultEvent(dbEvent);

    switch (re.event.__typename) {
      case 'PoolCreatedEvent': {
        const poolContract = ethers.utils.getAddress(re.event.pool);
        await this._db.saveContract(dbTx, poolContract, KIND_POOL, dbEvent.block.blockNumber);
      }
    }
  }

  async isUniswapContract (address: string): Promise<Contract | undefined> {
    return this._db.getContract(ethers.utils.getAddress(address));
  }

  async processEvent (event: Event): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      // Trigger indexing of data based on the event.
      await this.triggerIndexingOnEvent(dbTx, event);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
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

  async fetchAndSaveEvents ({ blockHash }: DeepPartial<BlockProgress>): Promise<void> {
    assert(blockHash);
    let { block, logs } = await this._ethClient.getLogs({ blockHash });

    const {
      allEthHeaderCids: {
        nodes: [
          {
            ethTransactionCidsByHeaderId: {
              nodes: transactions
            }
          }
        ]
      }
    } = await this._postgraphileClient.getBlockWithTransactions({ blockHash });

    const transactionMap = transactions.reduce((acc: {[key: string]: any}, transaction: {[key: string]: any}) => {
      acc[transaction.txHash] = transaction;
      return acc;
    }, {});

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
          hash: txHash
        }
      } = logObj;

      let eventName = UNKNOWN_EVENT_NAME;
      let eventInfo = {};
      const tx = transactionMap[txHash];
      const extraInfo = { topics, data, tx };

      const contract = ethers.utils.getAddress(address);
      const uniContract = await this.isUniswapContract(contract);

      if (uniContract) {
        const eventDetails = this.parseEventNameAndArgs(uniContract.kind, logObj);
        eventName = eventDetails.eventName;
        eventInfo = eventDetails.eventInfo;
      }

      dbEvents.push({
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

    const dbTx = await this._db.createTransactionRunner();

    try {
      block = {
        blockHash,
        blockNumber: block.number,
        blockTimestamp: block.timestamp,
        parentHash: block.parent.hash
      };

      await this._db.saveEvents(dbTx, block, dbEvents);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusIndexedBlock(dbTx, blockHash, blockNumber);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusChainHead(dbTx, blockHash, blockNumber);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusCanonicalBlock(dbTx, blockHash, blockNumber);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._db.getSyncStatus();
  }

  async getBlock (blockHash: string): Promise<any> {
    const { block } = await this._ethClient.getLogs({ blockHash });
    return block;
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._db.getEvent(id);
  }

  async saveEventEntity (dbEvent: Event): Promise<Event> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = this._db.saveEventEntity(dbTx, dbEvent);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._db.getBlockProgress(blockHash);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    return this._db.getBlocksAtHeight(height, isPruned);
  }

  async blockIsAncestor (ancestorBlockHash: string, blockHash: string, maxDepth: number): Promise<boolean> {
    assert(maxDepth > 0);

    let depth = 0;
    let currentBlockHash = blockHash;
    let currentBlock;

    // TODO: Use a hierarchical query to optimize this.
    while (depth < maxDepth) {
      depth++;

      currentBlock = await this._db.getBlockProgress(currentBlockHash);
      if (!currentBlock) {
        break;
      } else {
        if (currentBlock.parentHash === ancestorBlockHash) {
          return true;
        }

        // Descend the chain.
        currentBlockHash = currentBlock.parentHash;
      }
    }

    return false;
  }

  async markBlockAsPruned (block: BlockProgress): Promise<BlockProgress> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.markBlockAsPruned(dbTx, block);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateBlockProgress (blockHash: string, lastProcessedEventIndex: number): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateBlockProgress(dbTx, blockHash, lastProcessedEventIndex);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
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

  async position (blockHash: string, tokenId: string): Promise<any> {
    const nfpmContract = await this._db.getLatestContract('nfpm');
    assert(nfpmContract, 'No NFPM contract watched.');
    const { value, proof } = await this._getStorageValue(nfpmStorageLayout, blockHash, nfpmContract.address, '_positions', BigInt(tokenId));

    return {
      ...value,
      proof
    };
  }

  async poolIdToPoolKey (blockHash: string, poolId: string): Promise<any> {
    const nfpmContract = await this._db.getLatestContract('nfpm');
    assert(nfpmContract, 'No NFPM contract watched.');
    const { value, proof } = await this._getStorageValue(nfpmStorageLayout, blockHash, nfpmContract.address, '_poolIdToPoolKey', BigInt(poolId));

    return {
      ...value,
      proof
    };
  }

  async getPool (blockHash: string, token0: string, token1: string, fee: string): Promise<any> {
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

  async getContract (type: string): Promise<any> {
    const contract = await this._db.getLatestContract(type);
    return contract;
  }
}
