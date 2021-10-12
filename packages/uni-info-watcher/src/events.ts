//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { EventWatcher as BaseEventWatcher, EventWatcherInterface, JobQueue, QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING, UpstreamConfig } from '@vulcanize/util';

import { Indexer } from './indexer';

const log = debug('vulcanize:events');

export interface PoolCreatedEvent {
  __typename: 'PoolCreatedEvent';
  token0: string;
  token1: string;
  fee: string;
  tickSpacing: string;
  pool: string;
}

export interface InitializeEvent {
  __typename: 'InitializeEvent';
  sqrtPriceX96: string;
  tick: string;
}

export interface MintEvent {
  __typename: 'MintEvent';
  sender: string;
  owner: string;
  tickLower: string;
  tickUpper: string;
  amount: string;
  amount0: string;
  amount1: string;
}

export interface BurnEvent {
  __typename: 'BurnEvent';
  owner: string;
  tickLower: string;
  tickUpper: string;
  amount: string;
  amount0: string;
  amount1: string;
}

export interface SwapEvent {
  __typename: 'SwapEvent';
  sender: string;
  recipient: string;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  liquidity: string;
  tick: string;
}

export interface IncreaseLiquidityEvent {
  __typename: 'IncreaseLiquidityEvent';
  tokenId: string;
  liquidity: string;
  amount0: string;
  amount1: string;
}

export interface DecreaseLiquidityEvent {
  __typename: 'DecreaseLiquidityEvent';
  tokenId: string;
  liquidity: string;
  amount0: string;
  amount1: string;
}

export interface CollectEvent {
  __typename: 'CollectEvent';
  tokenId: string;
  recipient: string;
  amount0: string;
  amount1: string;
}

export interface TransferEvent {
  __typename: 'TransferEvent';
  from: string;
  to: string;
  tokenId: string;
}

export interface Block {
  cid: string;
  number: number;
  hash: string;
  timestamp: number;
  parentHash: string;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  index: number;
}

export interface ResultEvent {
  block: Block;
  tx: Transaction;
  contract: string;
  eventIndex: number;
  event: PoolCreatedEvent | InitializeEvent | MintEvent | BurnEvent | SwapEvent | IncreaseLiquidityEvent | DecreaseLiquidityEvent | CollectEvent | TransferEvent;
  proof: {
    data: string;
  }
}

export class EventWatcher implements EventWatcherInterface {
  _ethClient: EthClient
  _indexer: Indexer
  _subscription?: ZenObservable.Subscription
  _pubsub: PubSub
  _jobQueue: JobQueue
  _baseEventWatcher: BaseEventWatcher

  constructor (upstreamConfig: UpstreamConfig, ethClient: EthClient, postgraphileClient: EthClient, indexer: Indexer, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
    this._baseEventWatcher = new BaseEventWatcher(upstreamConfig, this._ethClient, postgraphileClient, this._indexer, this._pubsub, this._jobQueue);
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._baseEventWatcher.getBlockProgressEventIterator();
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');
    log('Started watching upstream events...');

    await this.initBlockProcessingOnCompleteHandler();
    await this.initEventProcessingOnCompleteHandler();
    this._baseEventWatcher.startBlockProcessing();
  }

  async stop (): Promise<void> {
    this._baseEventWatcher.stop();
  }

  async initBlockProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      const { id, data: { failed } } = job;

      if (failed) {
        log(`Job ${id} for queue ${QUEUE_BLOCK_PROCESSING} failed`);
        return;
      }

      await this._baseEventWatcher.blockProcessingCompleteHandler(job);
    });
  }

  async initEventProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      const { id, data: { failed } } = job;

      if (failed) {
        log(`Job ${id} for queue ${QUEUE_EVENT_PROCESSING} failed`);
        return;
      }

      await this._baseEventWatcher.eventProcessingCompleteHandler(job);
    });
  }
}
