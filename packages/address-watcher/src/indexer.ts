import assert from 'assert';
import debug from 'debug';
import { ethers } from 'ethers';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { GetStorageAt } from '@vulcanize/solidity-mapper';
import { TracingClient } from '@vulcanize/tracing-client';

import { addressesInTrace } from './util';
import { Database } from './database';
import { Trace } from './entity/Trace';
import { Account } from './entity/Account';

const log = debug('vulcanize:indexer');

const AddressEvent = 'address_event';

export class Indexer {
  _db: Database
  _ethClient: EthClient
  _pubsub: PubSub
  _getStorageAt: GetStorageAt
  _tracingClient: TracingClient

  constructor (db: Database, ethClient: EthClient, pubsub: PubSub, tracingClient: TracingClient) {
    assert(db);
    assert(ethClient);
    assert(pubsub);
    assert(tracingClient);

    this._db = db;
    this._ethClient = ethClient;
    this._pubsub = pubsub;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);
    this._tracingClient = tracingClient;
  }

  getAddressEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([AddressEvent]);
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

  async publishAddressEventToSubscribers (txHash: string): Promise<void> {
    const traceObj = await this._db.getTrace(txHash);
    if (!traceObj) {
      return;
    }

    const { blockNumber, blockHash, trace } = traceObj;

    for (let i = 0; i < traceObj.accounts.length; i++) {
      const account = traceObj.accounts[i];

      log(`pushing tx ${txHash} event to GQL subscribers for address ${account.address}`);

      // Publishing the event here will result in pushing the payload to GQL subscribers for `onAddressEvent(address)`.
      await this._pubsub.publish(AddressEvent, {
        onAddressEvent: {
          address: account.address,
          txTrace: {
            txHash,
            blockHash,
            blockNumber,
            trace
          }
        }
      });
    }
  }

  async traceTxAndIndexAppearances (txHash: string): Promise<Trace> {
    let entity = await this._db.getTrace(txHash);
    if (entity) {
      log('traceTx: db hit');
    } else {
      log('traceTx: db miss, fetching from tracing API server');

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
      await this.indexAppearances(entity);
    }

    return entity;
  }

  async getAppearances (address: string, fromBlockNumber: number, toBlockNumber: number): Promise<Trace[]> {
    return this._db.getAppearances(address, fromBlockNumber, toBlockNumber);
  }

  async indexAppearances (trace: Trace): Promise<Trace> {
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
