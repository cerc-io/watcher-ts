import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';
import { EthClient } from '@vulcanize/ipld-eth-client';

import { JobQueue } from '../../util';
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

export const QUEUE_EVENT_PROCESSING = 'event-processing';
export const QUEUE_BLOCK_PROCESSING = 'block-processing';

export class EventWatcher {
  _subscription?: ZenObservable.Subscription
  _ethClient: EthClient
  _jobQueue: JobQueue
  _indexer: Indexer

  constructor (indexer: Indexer, ethClient: EthClient, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._jobQueue = jobQueue;
    this._indexer = indexer;
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');
    log('Started watching upstream events...');

    await this._initBlockProcessingOnCompleteHandler();
    await this._initEventProcessingOnCompleteHandler();
    await this._watchBlocksAtChainHead();
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream events');
      this._subscription.unsubscribe();
    }
  }

  async _watchBlocksAtChainHead (): Promise<void> {
    log('Started watching upstream blocks...');
    this._subscription = await this._ethClient.watchBlocks(async (value) => {
      const { blockHash, blockNumber, parentHash, timestamp } = _.get(value, 'data.listen.relatedNode');

      await this._indexer.updateSyncStatus(blockHash, blockNumber);

      log('watchBlock', blockHash, blockNumber);

      const block = {
        hash: blockHash,
        number: blockNumber,
        parentHash,
        timestamp
      };

      await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { block });
    });
  }

  async _initBlockProcessingOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      const { data: { request: { data: { block } } } } = job;
      log(`Job onComplete block ${block.hash} ${block.number}`);
    });
  }

  async _initEventProcessingOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      const { data: { request } } = job;

      const dbEvent = await this._indexer.getEvent(request.data.id);
      assert(dbEvent);

      await this._indexer.updateBlockProgress(dbEvent.block.blockHash, dbEvent.index);

      log(`Job onComplete event ${request.data.id}`);
    });
  }
}
