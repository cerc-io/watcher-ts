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

      const blocks: string[] = [];

      const { logContracts } = receipt;
      if (logContracts && logContracts.length) {
        for (let logIndex = 0; logIndex < logContracts.length; logIndex++) {
          const { ethTransactionCidByTxId: { ethHeaderCidByHeaderId: { blockHash } } } = receipt;
          await this._indexer.getBlockEvents(blockHash);
          blocks.push(blockHash);
        }
      }

      const processedBlocks: any = {};
      if (!blocks.length) {
        return;
      }

      // Process events, if from known uniswap contracts.
      for (let bi = 0; bi < blocks.length; bi++) {
        const blockHash = blocks[bi];
        if (processedBlocks[blockHash]) {
          continue;
        }

        const events = await this._indexer.getBlockEvents(blockHash);
        for (let ei = 0; ei < events.length; ei++) {
          const eventObj = events[ei];
          const uniContract = await this._indexer.isUniswapContract(eventObj.contract);
          if (uniContract) {
            log('event', JSON.stringify(eventObj, null, 2));

            // TODO: Move processing to background queue (need sequential processing of events).
            // Trigger other indexer methods based on event topic.
            await this._indexer.processEvent(eventObj);
          }
        }

        processedBlocks[blockHash] = true;
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
