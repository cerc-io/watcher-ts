import assert from 'assert';
import { Connection, ConnectionOptions, createConnection, DeepPartial } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { Factory } from './entity/Factory';
import { Pool } from './entity/Pool';
import { Event } from './entity/Event';
import { Token } from './entity/Token';
import { EventSyncProgress } from './entity/EventProgress';

export class Database {
  _config: ConnectionOptions
  _conn!: Connection

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
  }

  async init (): Promise<void> {
    assert(!this._conn);

    this._conn = await createConnection({
      ...this._config,
      namingStrategy: new SnakeNamingStrategy()
    });
  }

  async close (): Promise<void> {
    return this._conn.close();
  }

  async getToken ({ id, blockNumber }: DeepPartial<Token>): Promise<Token | undefined> {
    const repo = this._conn.getRepository(Token);

    return repo.createQueryBuilder('token')
      .where('id = :id AND block_number <= :blockNumber', {
        id,
        blockNumber
      })
      .orderBy('token.block_number', 'DESC')
      .getOne();
  }

  async loadFactory ({ id, blockNumber, ...values }: DeepPartial<Factory>): Promise<Factory> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Factory);

      let entity = await repo.createQueryBuilder('factory')
        .where('id = :id AND block_number <= :blockNumber', {
          id,
          blockNumber
        })
        .orderBy('factory.block_number', 'DESC')
        .getOne();

      if (!entity) {
        entity = repo.create({ blockNumber, id, ...values });
        entity = await repo.save(entity);
      }

      return entity;
    });
  }

  async loadPool ({ id, blockNumber, ...values }: DeepPartial<Pool>): Promise<Pool> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Pool);

      let entity = await repo.createQueryBuilder('pool')
        .where('id = :id AND block_number <= :blockNumber', {
          id,
          blockNumber
        })
        .orderBy('pool.block_number', 'DESC')
        .getOne();

      if (!entity) {
        entity = repo.create({ blockNumber, id, ...values });
        entity = await repo.save(entity);
      }

      return entity;
    });
  }

  async loadToken ({ id, blockNumber, ...values }: DeepPartial<Token>): Promise<Token> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Token);

      let entity = await repo.createQueryBuilder('token')
        .where('id = :id AND block_number <= :blockNumber', {
          id,
          blockNumber
        })
        .orderBy('token.block_number', 'DESC')
        .getOne();

      if (!entity) {
        entity = repo.create({ blockNumber, id, ...values });
        entity = await repo.save(entity);
      }

      return entity;
    });
  }

  async saveFactory (factory: Factory, blockNumber: number): Promise<Factory> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Factory);
      factory.blockNumber = blockNumber;
      return repo.save(factory);
    });
  }

  // Returns true if events have already been synced for the (block, token) combination.
  async didSyncEvents ({ blockHash, token }: { blockHash: string, token: string }): Promise<boolean> {
    const numRows = await this._conn.getRepository(EventSyncProgress)
      .createQueryBuilder()
      .where('block_hash = :blockHash AND token = :token', {
        blockHash,
        token
      })
      .getCount();

    return numRows > 0;
  }

  async getEvents ({ blockHash, token }: { blockHash: string, token: string }): Promise<Event[]> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .where('block_hash = :blockHash AND token = :token', {
        blockHash,
        token
      })
      .addOrderBy('id', 'ASC')
      .getMany();
  }

  async getEventsByName ({ blockHash, token, eventName }: { blockHash: string, token: string, eventName: string }): Promise<Event[] | undefined> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .where('block_hash = :blockHash AND token = :token AND :eventName = :eventName', {
        blockHash,
        token,
        eventName
      })
      .getMany();
  }

  async saveEvents ({ blockHash, token, events }: { blockHash: string, token: string, events: DeepPartial<Event>[] }): Promise<void> {
    // In a transaction:
    // (1) Save all the events in the database.
    // (2) Add an entry to the event progress table.

    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(EventSyncProgress);

      // Check sync progress inside the transaction.
      const numRows = await repo
        .createQueryBuilder()
        .where('block_hash = :blockHash AND token = :token', {
          blockHash,
          token
        })
        .getCount();

      if (numRows === 0) {
        // Bulk insert events.
        await tx.createQueryBuilder()
          .insert()
          .into(Event)
          .values(events)
          .execute();

        // Update event sync progress.
        const progress = repo.create({ blockHash, token });
        await repo.save(progress);
      }
    });
  }
}
