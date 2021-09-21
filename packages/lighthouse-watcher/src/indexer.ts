//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import assert from 'assert';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { Config as BaseConfig } from '@vulcanize/util';

import lighthouseABI from './abi/Lighthouse.json';

export const UNKNOWN_EVENT_NAME = '__unknown__';

const log = debug('vulcanize:indexer');

export type ResultEvent = {
  block: any;
  tx: any;

  contract: string;

  eventIndex: number;
  event: any;

  proof: any;
};

export interface Config extends BaseConfig {
  watch?: {
    lighthouse: string
  }
}

export class Indexer {
  _config: Config
  _ethClient: EthClient
  _postgraphileClient: EthClient

  _lighthouseContract: ethers.utils.Interface

  constructor (config: Config, ethClient: EthClient, postgraphileClient: EthClient) {
    assert(config.watch);
    this._config = config;
    this._ethClient = ethClient;
    this._postgraphileClient = postgraphileClient;

    this._lighthouseContract = new ethers.utils.Interface(lighthouseABI);
  }

  // Note: Some event names might be unknown at this point, as earlier events might not yet be processed.
  async getOrFetchBlockEvents (blockHash: string): Promise<Array<ResultEvent>> {
    // Fetch and save events first and make a note in the event sync progress table.
    log(`getBlockEvents: fetching from upstream server ${blockHash}`);
    const events = await this.fetchEvents(blockHash);

    log(`getBlockEvents: ${blockHash} num events: ${events.length}`);

    return events;
  }

  parseEventNameAndArgs (logObj: any): any {
    let eventName = UNKNOWN_EVENT_NAME;
    let eventInfo = {};

    const { topics, data } = logObj;

    const logDescription = this._lighthouseContract.parseLog({ data, topics });
    switch (logDescription.name) {
      case 'StorageRequest': {
        eventName = logDescription.name;
        const { uploader, cid, config, fileCost } = logDescription.args;
        eventInfo = { uploader, cid, config, fileCost };

        break;
      }
    }

    return { eventName, eventInfo };
  }

  async fetchEvents (blockHash: string): Promise<Array<ResultEvent>> {
    assert(this._config.watch);
    const contract = this._config.watch.lighthouse;
    const { logs, block } = await this._ethClient.getLogs({ blockHash, contract });

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

    const events: Array<ResultEvent> = [];

    for (let li = 0; li < logs.length; li++) {
      const logObj = logs[li];
      const {
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
        const tx = transactionMap[txHash];
        assert(ethers.utils.getAddress(address) === contract);

        const eventDetails = this.parseEventNameAndArgs(logObj);
        const eventName = eventDetails.eventName;
        const eventInfo = eventDetails.eventInfo;

        const {
          hash,
          number,
          timestamp,
          parent: {
            hash: parentHash
          }
        } = block;

        events.push({
          block: {
            hash,
            number,
            timestamp,
            parentHash
          },
          eventIndex: logIndex,
          tx: {
            hash: txHash,
            index: tx.index,
            from: tx.src,
            to: tx.dst
          },
          contract,
          event: {
            __typename: `${eventName}Event`,
            ...eventInfo
          },
          proof: {
            data: JSONbig.stringify({
              blockHash,
              receiptCID,
              log: {
                cid,
                ipldBlock
              }
            })
          }
        });
      } else {
        log(`Skipping event for receipt ${receiptCID} due to failed transaction.`);
      }
    }

    return events;
  }
}
