//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { JsonFragment } from '@ethersproject/abi';
import { DeepPartial, FindConditions, FindManyOptions } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import { BaseProvider } from '@ethersproject/providers';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { StorageLayout } from '@vulcanize/solidity-mapper';
import { IndexerInterface, Indexer as BaseIndexer, ValueResult, UNKNOWN_EVENT_NAME, JobQueue, Where, QueryOptions, ServerConfig } from '@vulcanize/util';

import { Database } from './database';
import { Event } from './entity/Event';
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from './utils';
import { SyncStatus } from './entity/SyncStatus';
import artifacts from './artifacts/ERC20.json';
import { BlockProgress } from './entity/BlockProgress';
import { Contract } from './entity/Contract';

const log = debug('vulcanize:indexer');

const ETH_CALL_MODE = 'eth_call';

const TRANSFER_EVENT = 'Transfer';
const APPROVAL_EVENT = 'Approval';

interface EventResult {
  event: {
    from?: string;
    to?: string;
    owner?: string;
    spender?: string;
    value?: BigInt;
    __typename: string;
  }
  proof?: string;
}

export class Indexer implements IndexerInterface {
  _db: Database
  _ethClient: EthClient
  _ethProvider: BaseProvider
  _baseIndexer: BaseIndexer
  _serverConfig: ServerConfig

  _abi: JsonFragment[]
  _storageLayout: StorageLayout
  _contract: ethers.utils.Interface
  _serverMode: string

  constructor (serverConfig: ServerConfig, db: Database, ethClient: EthClient, ethProvider: BaseProvider, jobQueue: JobQueue) {
    assert(db);
    assert(ethClient);

    this._db = db;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._serverMode = serverConfig.mode;
    this._baseIndexer = new BaseIndexer(this._db, this._ethClient, this._ethProvider, jobQueue);

    const { abi, storageLayout } = artifacts;

    assert(abi);
    assert(storageLayout);

    this._abi = abi;
    this._storageLayout = storageLayout;

    this._contract = new ethers.utils.Interface(this._abi);
  }

  get serverConfig (): ServerConfig {
    return this._serverConfig;
  }

  async init (): Promise<void> {
    await this._baseIndexer.fetchContracts();
  }

  getResultEvent (event: Event): EventResult {
    const eventFields = JSON.parse(event.eventInfo);

    return {
      event: {
        __typename: `${event.eventName}Event`,
        ...eventFields
      },
      // TODO: Return proof only if requested.
      proof: JSON.parse(event.proof)
    };
  }

  async totalSupply (blockHash: string, token: string): Promise<ValueResult> {
    let result: ValueResult;

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenTotalSupply(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_totalSupply');
    }

    // https://github.com/GoogleChromeLabs/jsbi/issues/30#issuecomment-521460510
    log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async balanceOf (blockHash: string, token: string, owner: string): Promise<ValueResult> {
    const entity = await this._db.getBalance({ blockHash, token, owner });
    if (entity) {
      log('balanceOf: db hit');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('balanceOf: db miss, fetching from upstream server');
    let result: ValueResult;

    const { block: { number: blockNumber } } = await this._ethClient.getBlockByHash(blockHash);

    if (this._serverMode === ETH_CALL_MODE) {
      const contract = new ethers.Contract(token, this._abi, this._ethProvider);

      // eth_call doesnt support calling method by blockHash https://eth.wiki/json-rpc/API#the-default-block-parameter
      const value = await contract.balanceOf(owner, { blockTag: blockHash });

      result = {
        value: BigInt(value.toString())
      };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_balances', owner);
    }

    log(JSONbig.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveBalance({ blockHash, blockNumber, token, owner, value: BigInt(value), proof: JSONbig.stringify(proof) });

    return result;
  }

  async allowance (blockHash: string, token: string, owner: string, spender: string): Promise<ValueResult> {
    const entity = await this._db.getAllowance({ blockHash, token, owner, spender });
    if (entity) {
      log('allowance: db hit');

      return {
        value: entity.value,
        proof: JSON.parse(entity.proof)
      };
    }

    log('allowance: db miss, fetching from upstream server');
    let result: ValueResult;

    const { block: { number: blockNumber } } = await this._ethClient.getBlockByHash(blockHash);

    if (this._serverMode === ETH_CALL_MODE) {
      const contract = new ethers.Contract(token, this._abi, this._ethProvider);
      const value = await contract.allowance(owner, spender, { blockTag: blockHash });

      result = {
        value: BigInt(value.toString())
      };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_allowances', owner, spender);
    }

    // log(JSONbig.stringify(result, null, 2));

    const { value, proof } = result;
    await this._db.saveAllowance({ blockHash, blockNumber, token, owner, spender, value: BigInt(value), proof: JSONbig.stringify(proof) });

    return result;
  }

  async name (blockHash: string, token: string): Promise<ValueResult> {
    let result: ValueResult;

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenName(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_name');
    }

    // log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async symbol (blockHash: string, token: string): Promise<ValueResult> {
    let result: ValueResult;

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenSymbol(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      result = await this._baseIndexer.getStorageValue(this._storageLayout, blockHash, token, '_symbol');
    }

    // log(JSONbig.stringify(result, null, 2));

    return result;
  }

  async decimals (blockHash: string, token: string): Promise<ValueResult> {
    let result: ValueResult;

    if (this._serverMode === ETH_CALL_MODE) {
      const value = await fetchTokenDecimals(this._ethProvider, blockHash, token);

      result = { value };
    } else {
      // Not a state variable, uses hardcoded return value in contract function.
      // See https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol#L86
      throw new Error('Not implemented.');
    }

    return result;
  }

  async triggerIndexingOnEvent (event: Event): Promise<void> {
    const { eventName, eventInfo, contract: token, block: { blockHash } } = event;
    const eventFields = JSON.parse(eventInfo);

    // What data we index depends on the kind of event.
    switch (eventName) {
      case TRANSFER_EVENT: {
        // On a transfer, balances for both parties change.
        // Therefore, trigger indexing for both sender and receiver.
        const { from, to } = eventFields;
        await this.balanceOf(blockHash, token, from);
        await this.balanceOf(blockHash, token, to);

        break;
      }
      case APPROVAL_EVENT: {
        // Update allowance for (owner, spender) combination.
        const { owner, spender } = eventFields;
        await this.allowance(blockHash, token, owner, spender);

        break;
      }
    }
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    const { topics, data } = logObj;
    const logDescription = this._contract.parseLog({ data, topics });

    const { eventName, eventInfo } = this._baseIndexer.parseEvent(logDescription);

    return { eventName, eventInfo };
  }

  async getEventsByFilter (blockHash: string, contract: string, name?: string): Promise<Array<Event>> {
    return this._baseIndexer.getEventsByFilter(blockHash, contract, name);
  }

  async isWatchedContract (address : string): Promise<Contract | undefined> {
    return this._baseIndexer.isWatchedContract(address);
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
    return this._baseIndexer.watchContract(address, kind, checkpoint, startingBlock);
  }

  cacheContract (contract: Contract): void {
    return this._baseIndexer.cacheContract(contract);
  }

  async saveEventEntity (dbEvent: Event): Promise<Event> {
    return this._baseIndexer.saveEventEntity(dbEvent);
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._baseIndexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    return this._baseIndexer.getEventsInRange(fromBlockNumber, toBlockNumber);
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusIndexedBlock(blockHash, blockNumber, force);
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusChainHead(blockHash, blockNumber, force);
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusCanonicalBlock(blockHash, blockNumber, force);
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._baseIndexer.getSyncStatus();
  }

  async getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any> {
    return this._baseIndexer.getBlocks(blockFilter);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._baseIndexer.getEvent(id);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._baseIndexer.getBlockProgress(blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgress>, options: FindManyOptions<BlockProgress>): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlockProgressEntities(where, options);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlocksAtHeight(height, isPruned);
  }

  async fetchBlockEvents (block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    return this._baseIndexer.fetchBlockEvents(block, this._fetchAndSaveEvents.bind(this));
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<Event>> {
    return this._baseIndexer.getBlockEvents(blockHash, where, queryOptions);
  }

  async removeUnknownEvents (block: BlockProgress): Promise<void> {
    return this._baseIndexer.removeUnknownEvents(Event, block);
  }

  async markBlocksAsPruned (blocks: BlockProgress[]): Promise<void> {
    return this._baseIndexer.markBlocksAsPruned(blocks);
  }

  async updateBlockProgress (block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    return this._baseIndexer.updateBlockProgress(block, lastProcessedEventIndex);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseIndexer.getAncestorAtDepth(blockHash, depth);
  }

  async _fetchAndSaveEvents ({ cid: blockCid, blockHash }: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    assert(blockHash);
    let [{ block }, { logs }] = await Promise.all([
      this._ethClient.getBlockByHash(blockHash),
      this._ethClient.getLogs({ blockHash })
    ]);

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
        const extraInfo = { topics, data };

        const contract = ethers.utils.getAddress(address);
        const watchedContract = await this.isWatchedContract(contract);

        if (watchedContract) {
          const eventDetails = this.parseEventNameAndArgs(watchedContract.kind, logObj);
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
        cid: blockCid,
        blockHash,
        blockNumber: block.number,
        blockTimestamp: block.timestamp,
        parentHash: block.parent.hash
      };

      const blockProgress = await this._db.saveEvents(dbTx, block, dbEvents);
      await dbTx.commitTransaction();

      return blockProgress;
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }
}
