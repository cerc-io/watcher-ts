import assert from 'assert';
import debug from 'debug';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';

import { Database } from './database';

const log = debug('vulcanize:events');

interface PoolCreatedEvent {
  token0: string;
  token1: string;
  fee: bigint;
  tickSpacing: bigint;
  pool: string;
}

interface ResultEvent {
  proof: {
    data: string
  }
  event: {
    __typename: string;
    [key: string]: any;
  }
}

export class EventWatcher {
  _db: Database
  _subscription?: ZenObservable.Subscription
  _uniClient: UniClient
  _erc20Client: ERC20Client

  constructor (db: Database, uniClient: UniClient, erc20Client: ERC20Client) {
    assert(db);

    this._db = db;
    this._uniClient = uniClient;
    this._erc20Client = erc20Client;
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');
    log('Started watching upstream events...');
    this._subscription = await this._uniClient.watchEvents(this._handleEvents.bind(this));
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream events');
      this._subscription.unsubscribe();
    }
  }

  async _handleEvents ({ blockHash, blockNumber, contract, event }: { blockHash: string, blockNumber: number, contract: string, event: ResultEvent}): Promise<void> {
    // TODO: Process proof (proof.data) in event.
    const { event: { __typename: eventType, ...eventValues } } = event;

    switch (eventType) {
      case 'PoolCreatedEvent':
        this._handlePoolCreated(blockHash, blockNumber, contract, eventValues as PoolCreatedEvent);
        break;

      default:
        break;
    }
  }

  async _handlePoolCreated (blockHash: string, blockNumber: number, contractAddress: string, poolCreatedEvent: PoolCreatedEvent): Promise<void> {
    const { token0: token0Address, token1: token1Address, fee, tickSpacing, pool: poolAddress } = poolCreatedEvent;

    // Load factory.
    const factory = await this._db.loadFactory({ blockNumber, id: contractAddress });
    factory.poolCount = factory.poolCount + 1;

    // Create new Pool entity.
    const pool = this._db.loadPool({ blockNumber, id: poolAddress });

    // TODO: Load Token entities.
    const getTokenValues = async (tokenAddress: string) => {
      const { value: symbol } = await this._erc20Client.getSymbol(blockHash, tokenAddress);
      return { symbol };
    };

    const token0 = this._db.loadToken({ blockNumber, id: token0Address }, () => getTokenValues(token0Address));
    const token1 = this._db.loadToken({ blockNumber, id: token1Address }, () => getTokenValues(token1Address));

    // TODO: Update Token entities.

    // TODO: Update Pool entity.

    // TODO: Save entities to DB.
  }
}
