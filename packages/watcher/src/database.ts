import assert from "assert";
import { Connection, createConnection } from "typeorm";
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { Allowance } from "./entity/Allowance";
import { Balance } from "./entity/Balance";
import { Event } from "./entity/Event";
import { EventSyncProgress } from "./entity/EventProgress";

export class Database {

  _config: any
  _conn: Connection

  constructor(config) {
    assert(config);
    this._config = config;
  }

  async init() {
    assert(!this._conn);

    this._conn = await createConnection({
      ...this._config,
      namingStrategy: new SnakeNamingStrategy()
    });
  }

  async getBalance({ blockHash, token, owner }) {
    return this._conn.getRepository(Balance)
      .createQueryBuilder("balance")
      .where("block_hash = :blockHash AND token = :token AND owner = :owner", {
        blockHash,
        token,
        owner
      })
      .getOne();
  }

  async getAllowance({ blockHash, token, owner, spender }) {
    return this._conn.getRepository(Allowance)
      .createQueryBuilder("allowance")
      .where("block_hash = :blockHash AND token = :token AND owner = :owner AND spender = :spender", {
        blockHash,
        token,
        owner,
        spender
      })
      .getOne();
  }

  async saveBalance({ blockHash, token, owner, value, proof }) {
    const repo = this._conn.getRepository(Balance);
    const entity = repo.create({ blockHash, token, owner, value, proof });
    return repo.save(entity);
  }

  async saveAllowance({ blockHash, token, owner, spender, value, proof }) {
    const repo = this._conn.getRepository(Allowance);
    const entity = repo.create({ blockHash, token, owner, spender, value, proof });
    return repo.save(entity);
  }

  // Returns true if events have already been synced for the (block, token) combination.
  async didSyncEvents({ blockHash, token }) {
    const numRows = await this._conn.getRepository(EventSyncProgress)
      .createQueryBuilder()
      .where("block_hash = :blockHash AND token = :token", {
        blockHash,
        token,
      })
      .getCount();

    return numRows > 0;
  }

  async getEvents({ blockHash, token }) {
    return this._conn.getRepository(Event)
      .createQueryBuilder("event")
      .where("block_hash = :blockHash AND token = :token", {
        blockHash,
        token,
      })
      .getMany();
  }

  async getEventsByName({ blockHash, token, eventName }) {
    return this._conn.getRepository(Event)
      .createQueryBuilder("event")
      .where("block_hash = :blockHash AND token = :token AND :eventName = :eventName", {
        blockHash,
        token,
        eventName
      })
      .getMany();
  }

  async saveEvents({ blockHash, token, events }) {
    // TODO: Using the same connection doesn't work when > 1 inserts are attempted at the same time (e.g. simultaneous GQL requests).

    // In a transaction:
    // (1) Save all the events in the database.
    // (2) Add an entry to the event progress table.

    await this._conn.transaction(async (tx) => {
      // Bulk insert events.
      await tx.createQueryBuilder()
        .insert()
        .into(Event)
        .values(events)
        .execute();

      // Update event sync progress.
      const repo = tx.getRepository(EventSyncProgress);
      const progress = repo.create({ blockHash, token });
      await repo.save(progress);
    });
  }
}
