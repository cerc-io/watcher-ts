//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';

import { JsonFragment } from '@ethersproject/abi';
import { BaseProvider } from '@ethersproject/providers';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { StorageLayout } from '@vulcanize/solidity-mapper';
import { EventInterface, Indexer as BaseIndexer, ValueResult, UNKNOWN_EVENT_NAME } from '@vulcanize/util';
import { GraphWatcher } from '@vulcanize/graph-node';

import { Database } from './database';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { BlockProgress } from './entity/BlockProgress';
import artifacts from './artifacts/Example.json';
import { handleEvent } from './hooks';

const log = debug('vulcanize:indexer');

const TEST_EVENT = 'Test';

export type ResultEvent = {
  block: {
    hash: string;
    number: number;
    timestamp: number;
    parentHash: string;
  };
  tx: {
    hash: string;
    from: string;
    to: string;
    index: number;
  };

  contract: string;

  eventIndex: number;
  eventSignature: string;
  event: any;

  proof: string;
}

export class Indexer {
  _db: Database
  _ethClient: EthClient
  _ethProvider: BaseProvider
  _postgraphileClient: EthClient;
  _graphWatcher: GraphWatcher;
  _baseIndexer: BaseIndexer;

  _abi: JsonFragment[]
  _storageLayout: StorageLayout
  _contract: ethers.utils.Interface

  constructor (db: Database, ethClient: EthClient, postgraphileClient: EthClient, ethProvider: BaseProvider, graphWatcher: GraphWatcher) {
    assert(db);
    assert(ethClient);

    this._db = db;
    this._ethClient = ethClient;
    this._postgraphileClient = postgraphileClient;
    this._ethProvider = ethProvider;
    this._graphWatcher = graphWatcher;
    this._baseIndexer = new BaseIndexer(this._db, this._ethClient, this._ethProvider);

    const { abi, storageLayout } = artifacts;

    assert(abi);
    assert(storageLayout);

    this._abi = abi;
    this._storageLayout = storageLayout;

    this._contract = new ethers.utils.Interface(this._abi);
  }

  getResultEvent (event: Event): ResultEvent {
    const block = event.block;
    const eventFields = JSONbig.parse(event.eventInfo);
    const { tx, eventSignature } = JSON.parse(event.extraInfo);

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
      eventSignature,
      event: {
        __typename: `${event.eventName}Event`,
        ...eventFields
      },

      // TODO: Return proof only if requested.
      proof: JSON.parse(event.proof)
    };
  }

  async getMethod (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const entity = await this._db.getGetMethod({ blockHash, contractAddress });
    if (entity) {
      log('getMethod: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('getMethod: db miss, fetching from upstream server');

    const contract = new ethers.Contract(contractAddress, this._abi, this._ethProvider);

    const value = await contract.getMethod({ blockTag: blockHash });

    const result: ValueResult = { value };

    await this._db.saveGetMethod({ blockHash, contractAddress, value: result.value, proof: JSONbig.stringify(result.proof) });

    return result;
  }

  async _test (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const entity = await this._db.get_test({ blockHash, contractAddress });
    if (entity) {
      log('_test: db hit.');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('_test: db miss, fetching from upstream server');

    const result = await this._baseIndexer.getStorageValue(
      this._storageLayout,
      blockHash,
      contractAddress,
      '_test'
    );

    await this._db.save_test({ blockHash, contractAddress, value: result.value, proof: JSONbig.stringify(result.proof) });

    return result;
  }

  async getExampleEntity (blockHash: string, id: string): Promise<string> {
    const blockProgress = await this.getBlockProgress(blockHash);
    assert(blockProgress);

    const block = {
      hash: blockProgress.blockHash,
      number: blockProgress.blockNumber,
      timestamp: blockProgress.blockTimestamp,
      parentHash: blockProgress.parentHash
    };

    const entity = await this._graphWatcher.getEntity(block, 'ExampleEntity', id);

    return JSON.stringify(entity, undefined, 2);
  }

  async triggerIndexingOnEvent (event: Event): Promise<void> {
    const resultEvent = this.getResultEvent(event);

    // Call subgraph handler for event.
    await this._graphWatcher.handleEvent(resultEvent);

    // Call custom hook function for indexing on event.
    await handleEvent(this, resultEvent);
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    let eventName = UNKNOWN_EVENT_NAME;
    let eventInfo = {};

    const { topics, data } = logObj;
    const logDescription = this._contract.parseLog({ data, topics });

    switch (logDescription.name) {
      case TEST_EVENT: {
        eventName = logDescription.name;
        const { param1, param2 } = logDescription.args;
        eventInfo = {
          param1,
          param2
        };

        break;
      }
    }

    return {
      eventName,
      eventInfo,
      eventSignature: logDescription.signature
    };
  }

  async watchContract (address: string, startingBlock: number): Promise<boolean> {
    // Always use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress).
    await this._db.saveContract(ethers.utils.getAddress(address), 'Example', startingBlock);

    return true;
  }

  async getEventsByFilter (blockHash: string, contract: string, name: string | null): Promise<Array<Event>> {
    return this._baseIndexer.getEventsByFilter(blockHash, contract, name);
  }

  async isWatchedContract (address : string): Promise<Contract | undefined> {
    return this._baseIndexer.isWatchedContract(address);
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._baseIndexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    return this._baseIndexer.getEventsInRange(fromBlockNumber, toBlockNumber);
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._baseIndexer.getSyncStatus();
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusIndexedBlock(blockHash, blockNumber);
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusChainHead(blockHash, blockNumber);
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusCanonicalBlock(blockHash, blockNumber);
  }

  async getBlock (blockHash: string): Promise<any> {
    return this._baseIndexer.getBlock(blockHash);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._baseIndexer.getEvent(id);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._baseIndexer.getBlockProgress(blockHash);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlocksAtHeight(height, isPruned);
  }

  async getOrFetchBlockEvents (block: DeepPartial<BlockProgress>): Promise<Array<EventInterface>> {
    return this._baseIndexer.getOrFetchBlockEvents(block, this._fetchAndSaveEvents.bind(this));
  }

  async getBlockEvents (blockHash: string): Promise<Array<Event>> {
    return this._baseIndexer.getBlockEvents(blockHash);
  }

  async removeUnknownEvents (block: BlockProgress): Promise<void> {
    return this._baseIndexer.removeUnknownEvents(Event, block);
  }

  async markBlocksAsPruned (blocks: BlockProgress[]): Promise<void> {
    return this._baseIndexer.markBlocksAsPruned(blocks);
  }

  async updateBlockProgress (blockHash: string, lastProcessedEventIndex: number): Promise<void> {
    return this._baseIndexer.updateBlockProgress(blockHash, lastProcessedEventIndex);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseIndexer.getAncestorAtDepth(blockHash, depth);
  }

  async _fetchAndSaveEvents ({ blockHash }: DeepPartial<BlockProgress>): Promise<void> {
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
        },
        receiptCID,
        status
      } = logObj;

      if (status) {
        let eventName = UNKNOWN_EVENT_NAME;
        let eventInfo = {};
        const tx = transactionMap[txHash];
        const extraInfo: { [key: string]: any } = { topics, data, tx };

        const contract = ethers.utils.getAddress(address);
        const watchedContract = await this.isWatchedContract(contract);

        if (watchedContract) {
          const eventDetails = this.parseEventNameAndArgs(watchedContract.kind, logObj);
          eventName = eventDetails.eventName;
          eventInfo = eventDetails.eventInfo;
          extraInfo.eventSignature = eventDetails.eventSignature;
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
              receiptCID,
              log: {
                cid,
                ipldBlock
              }
            })
          })
        });
      } else {
        log(`Skipping event for receipt ${receiptCID} due to failed transaction.`);
      }
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
}
