import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { Indexer } from './indexer';

const log = debug('vulcanize:tx-watcher');

export class TxWatcher {
  _ethClient: EthClient
  _indexer: Indexer
  _subscription: ZenObservable.Subscription | undefined

  constructor (ethClient: EthClient, indexer: Indexer) {
    assert(ethClient);
    assert(indexer);

    this._ethClient = ethClient;
    this._indexer = indexer;
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');

    log('Started watching upstream tx...');

    this._subscription = await this._ethClient.watchTransactions(async (value) => {
      const { txHash, ethHeaderCidByHeaderId: { blockHash, blockNumber } } = _.get(value, 'data.listen.relatedNode');
      log('watchTransaction', JSON.stringify({ txHash, blockHash, blockNumber }, null, 2));
      await this._indexer.traceTxAndIndexAppearances(txHash);
    });
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream tx');
      this._subscription.unsubscribe();
    }
  }
}
