import assert from 'assert';
import debug from 'debug';
import { ethers } from 'ethers';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { GetStorageAt } from '@vulcanize/solidity-mapper';
import { TracingClient } from '@vulcanize/tracing-client';

import { Database } from './database';

const log = debug('vulcanize:indexer');

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

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator(['event']);
  }

  async isWatchedAddress (address : string): Promise<boolean> {
    assert(address);

    return this._db.isWatchedAddress(ethers.utils.getAddress(address));
  }

  async watchAddress (address: string, startingBlock: number): Promise<boolean> {
    // Always use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress).
    await this._db.saveAddress(ethers.utils.getAddress(address), startingBlock);

    return true;
  }

  async traceTx (txHash: string): Promise<any> {
    let entity = await this._db.getTrace(txHash);
    if (entity) {
      log('traceTx: db hit');
    } else {
      log('traceTx: db miss, fetching from tracing API server');

      const tx = await this._tracingClient.getTx(txHash);
      const trace = await this._tracingClient.getTxTrace(txHash, 'callTraceWithAddresses', '15s');

      entity = await this._db.saveTrace({
        txHash,
        blockNumber: tx.blockNumber,
        blockHash: tx.blockHash,
        trace: JSON.stringify(trace)
      });
    }

    return {
      txHash,
      blockNumber: entity.blockNumber,
      blockHash: entity.blockHash,
      trace: entity.trace
    };
  }
}
