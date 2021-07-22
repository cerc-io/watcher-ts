import assert from 'assert';
import debug from 'debug';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { JobQueue } from '../../util';
import { Indexer } from './indexer';

const log = debug('vulcanize:events');

export interface PoolCreatedEvent {
  __typename: 'PoolCreatedEvent';
  token0: string;
  token1: string;
  fee: bigint;
  tickSpacing: bigint;
  pool: string;
}

export interface InitializeEvent {
  __typename: 'InitializeEvent';
  sqrtPriceX96: bigint;
  tick: bigint;
}

export interface MintEvent {
  __typename: 'MintEvent';
  sender: string;
  owner: string;
  tickLower: bigint;
  tickUpper: bigint;
  amount: bigint;
  amount0: bigint;
  amount1: bigint;
}

export interface BurnEvent {
  __typename: 'BurnEvent';
  owner: string;
  tickLower: bigint;
  tickUpper: bigint;
  amount: bigint;
  amount0: bigint;
  amount1: bigint;
}

export interface SwapEvent {
  __typename: 'SwapEvent';
  sender: string;
  recipient: string;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: bigint;
}

export interface IncreaseLiquidityEvent {
  __typename: 'IncreaseLiquidityEvent';
  tokenId: bigint;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
}

export interface DecreaseLiquidityEvent {
  __typename: 'DecreaseLiquidityEvent';
  tokenId: bigint;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
}

export interface Block {
  number: number;
  hash: string;
  timestamp: number;
  parentHash: string;
}

export interface Transaction {
  hash: string;
  from?: string;
}

export interface ResultEvent {
  block: Block;
  tx: Transaction;
  contract: string;
  eventIndex: number;
  event: PoolCreatedEvent | InitializeEvent | MintEvent | BurnEvent | SwapEvent | IncreaseLiquidityEvent | DecreaseLiquidityEvent;
  proof: {
    data: string;
  }
}

export const QUEUE_EVENT_PROCESSING = 'event-processing';
export const QUEUE_BLOCK_PROCESSING = 'block-processing';

export class EventWatcher {
  _subscription?: ZenObservable.Subscription
  _uniClient: UniClient
  _jobQueue: JobQueue
  _indexer: Indexer

  constructor (indexer: Indexer, uniClient: UniClient, jobQueue: JobQueue) {
    this._uniClient = uniClient;
    this._jobQueue = jobQueue;
    this._indexer = indexer;
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');
    log('Started watching upstream events...');

    this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      const { data: { request: { data: { block } } } } = job;
      log(`Job onComplete block ${block.hash} ${block.number}`);
    });

    this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      const { data: { request } } = job;

      log(`Job onComplete event ${request.data.id}`);
    });

    this._subscription = await this._uniClient.watchEvents(async ({ block }: ResultEvent) => {
      log('watchEvent', block.hash, block.number);
      return this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { block });
    });
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream events');
      this._subscription.unsubscribe();
    }
  }
}
