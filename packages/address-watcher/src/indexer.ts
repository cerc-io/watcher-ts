//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { ethers } from 'ethers';

import { EthClient } from '@cerc-io/ipld-eth-client';
import { GetStorageAt } from '@cerc-io/solidity-mapper';
import { TracingClient } from '@cerc-io/tracing-client';

import { addressesInTrace } from './util';
import { Database } from './database';
import { Trace } from './entity/Trace';
import { Account } from './entity/Account';
import { BlockProgress } from './entity/BlockProgress';

const log = debug('vulcanize:indexer');

export class Indexer {
  _db: Database;
  _ethClient: EthClient;
  _getStorageAt: GetStorageAt;
  _tracingClient: TracingClient;

  constructor (db: Database, ethClient: EthClient, tracingClient: TracingClient) {
    assert(db);
    assert(ethClient);
    assert(tracingClient);

    this._db = db;
    this._ethClient = ethClient;
    this._tracingClient = tracingClient;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);
  }

  async isWatchedAddress (address : string): Promise<boolean> {
    assert(address);

    return this._db.isWatchedAddress(ethers.utils.getAddress(address));
  }

  async watchAddress (address: string, startingBlock: number): Promise<boolean> {
    // Always use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress).
    await this._db.saveAccount(ethers.utils.getAddress(address), startingBlock);

    return true;
  }

  async getTrace (txHash: string): Promise<Trace | undefined> {
    return this._db.getTrace(txHash);
  }

  async traceTxAndIndexAppearances (txHash: string): Promise<Trace> {
    let entity = await this._db.getTrace(txHash);
    if (entity) {
      log(`traceTx: db hit ${txHash}`);
    } else {
      log(`traceTx: db miss, fetching from tracing API server ${txHash}`);

      const tx = await this._tracingClient.getTx(txHash);
      const trace = await this._tracingClient.getTxTrace(txHash, 'callTraceWithAddresses', '15s');

      await this._db.saveTrace({
        txHash,
        blockNumber: tx.blockNumber,
        blockHash: tx.blockHash,
        trace: JSON.stringify(trace)
      });

      entity = await this._db.getTrace(txHash);

      assert(entity);
      await this._indexAppearances(entity);
    }

    return entity;
  }

  async getAppearances (address: string, fromBlockNumber: number, toBlockNumber: number): Promise<Trace[]> {
    return this._db.getAppearances(address, fromBlockNumber, toBlockNumber);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._db.getBlockProgress(blockHash);
  }

  async updateBlockProgress (blockHash: string): Promise<void> {
    return this._db.updateBlockProgress(blockHash);
  }

  async _indexAppearances (trace: Trace): Promise<Trace> {
    const traceObj = JSON.parse(trace.trace);

    // TODO: Check if tx has failed?
    const addresses = addressesInTrace(traceObj);

    trace.accounts = addresses.map((address: string) => {
      assert(address);

      const account = new Account();
      account.address = ethers.utils.getAddress(address);
      account.startingBlock = trace.blockNumber;

      return account;
    });

    return await this._db.saveTraceEntity(trace);
  }
}
