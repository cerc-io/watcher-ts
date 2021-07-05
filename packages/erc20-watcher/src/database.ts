import assert from 'assert';
import { Connection, ConnectionOptions, createConnection, DeepPartial } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { Allowance } from './entity/Allowance';
import { Balance } from './entity/Balance';
import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
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

  async getBalance ({ blockHash, token, owner }: { blockHash: string, token: string, owner: string }): Promise<Balance | undefined> {
    return this._conn.getRepository(Balance)
      .createQueryBuilder('balance')
      .where('block_hash = :blockHash AND token = :token AND owner = :owner', {
        blockHash,
        token,
        owner
      })
      .getOne();
  }

  async getAllowance ({ blockHash, token, owner, spender }: { blockHash: string, token: string, owner: string, spender: string }): Promise<Allowance | undefined> {
    return this._conn.getRepository(Allowance)
      .createQueryBuilder('allowance')
      .where('block_hash = :blockHash AND token = :token AND owner = :owner AND spender = :spender', {
        blockHash,
        token,
        owner,
        spender
      })
      .getOne();
  }

  async saveBalance ({ blockHash, token, owner, value, proof }: DeepPartial<Balance>): Promise<Balance> {
    const repo = this._conn.getRepository(Balance);
    const entity = repo.create({ blockHash, token, owner, value, proof });
    return repo.save(entity);
  }

  async saveAllowance ({ blockHash, token, owner, spender, value, proof }: DeepPartial<Allowance>): Promise<Allowance> {
    const repo = this._conn.getRepository(Allowance);
    const entity = repo.create({ blockHash, token, owner, spender, value, proof });
    return repo.save(entity);
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
      .where('block_hash = :blockHash AND token = :token AND event_name = :eventName', {
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

  async isWatchedContract (address: string): Promise<boolean> {
    const numRows = await this._conn.getRepository(Contract)
      .createQueryBuilder()
      .where('address = :address', { address })
      .getCount();

    return numRows > 0;
  }

  async saveContract (address: string, startingBlock: number): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Contract);

      const numRows = await repo
        .createQueryBuilder()
        .where('address = :address', { address })
        .getCount();

      if (numRows === 0) {
        const entity = repo.create({ address, startingBlock });
        await repo.save(entity);
      }
    });
  }
}
