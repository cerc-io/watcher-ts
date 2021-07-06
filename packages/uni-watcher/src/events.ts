import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { Indexer } from './indexer';

const log = debug('vulcanize:events');

export class EventWatcher {
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

    log('Started watching upstream logs...');

    this._subscription = await this._ethClient.watchLogs(async (value) => {
      const receipt = _.get(value, 'data.listen.relatedNode');
      log('watchLogs', JSON.stringify(receipt, null, 2));

      // Check if this log is for a contract we care about.
      const { logContracts } = receipt;
      if (logContracts && logContracts.length) {
        for (let logIndex = 0; logIndex < logContracts.length; logIndex++) {
          const contractAddress = logContracts[logIndex];
          const uniContract = await this._indexer.isUniswapContract(contractAddress);
          if (uniContract) {
            const { ethTransactionCidByTxId: { ethHeaderCidByHeaderId: { blockHash, blockNumber } } } = receipt;
            const events = await this._indexer.getEvents(blockHash, contractAddress, null);
            const event = events[logIndex];

            // Trigger other indexer methods based on event topic.
            await this._indexer.processEvent(blockHash, blockNumber, uniContract, receipt, event);
          }
        }
      }
    });
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream logs');
      this._subscription.unsubscribe();
    }
  }
}
