import assert from 'assert';
import { Connection, ConnectionOptions, createConnection, DeepPartial, FindConditions, FindOneOptions, LessThanOrEqual } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { EventSyncProgress } from './entity/EventProgress';
import { Factory } from './entity/Factory';
import { Pool } from './entity/Pool';
import { Event } from './entity/Event';
import { Token } from './entity/Token';
import { Bundle } from './entity/Bundle';
import { PoolDayData } from './entity/PoolDayData';
import { PoolHourData } from './entity/PoolHourData';

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

    const whereOptions: FindConditions<Token> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<Token> = {
      where: whereOptions,
      relations: ['whitelistPools', 'whitelistPools.token0', 'whitelistPools.token1'],
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async getPool ({ id, blockNumber }: DeepPartial<Pool>): Promise<Pool | undefined> {
    const repo = this._conn.getRepository(Pool);
    const whereOptions: FindConditions<Pool> = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions: FindOneOptions<Pool> = {
      where: whereOptions,
      relations: ['token0', 'token1'],
      order: {
        blockNumber: 'DESC'
      }
    };

    return repo.findOne(findOptions);
  }

  async loadFactory ({ id, blockNumber, ...values }: DeepPartial<Factory>): Promise<Factory> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Factory);

      let selectQueryBuilder = repo.createQueryBuilder('factory')
        .where('id = :id', { id });

      if (blockNumber) {
        selectQueryBuilder = selectQueryBuilder.andWhere('block_number <= :blockNumber', { blockNumber });
      }

      let entity = await selectQueryBuilder.orderBy('factory.block_number', 'DESC')
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

      const whereOptions: FindConditions<Pool> = { id };

      if (blockNumber) {
        whereOptions.blockNumber = LessThanOrEqual(blockNumber);
      }

      const findOptions: FindOneOptions<Pool> = {
        where: whereOptions,
        relations: ['token0', 'token1'],
        order: {
          blockNumber: 'DESC'
        }
      };

      let entity = await repo.findOne(findOptions);

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

      const whereOptions: FindConditions<Token> = { id };

      if (blockNumber) {
        whereOptions.blockNumber = LessThanOrEqual(blockNumber);
      }

      const findOptions: FindOneOptions<Token> = {
        where: whereOptions,
        relations: ['whitelistPools', 'whitelistPools.token0', 'whitelistPools.token1'],
        order: {
          blockNumber: 'DESC'
        }
      };

      let entity = await repo.findOne(findOptions);

      if (!entity) {
        entity = repo.create({ blockNumber, id, ...values });
        entity = await repo.save(entity);

        // TODO: Find way to preload relations during create.
        entity.whitelistPools = [];
      }

      return entity;
    });
  }

  async loadBundle ({ id, blockNumber, ...values }: DeepPartial<Bundle>): Promise<Bundle> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Bundle);

      let selectQueryBuilder = repo.createQueryBuilder('bundle')
        .where('id = :id', { id });

      if (blockNumber) {
        selectQueryBuilder = selectQueryBuilder.andWhere('block_number <= :blockNumber', { blockNumber });
      }

      let entity = await selectQueryBuilder.orderBy('bundle.block_number', 'DESC')
        .getOne();

      if (!entity) {
        entity = repo.create({ blockNumber, id, ...values });
        entity = await repo.save(entity);
      }

      return entity;
    });
  }

  async loadPoolDayData ({ id, blockNumber, ...values }: DeepPartial<PoolDayData>): Promise<PoolDayData> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(PoolDayData);

      let selectQueryBuilder = repo.createQueryBuilder('pool_day_data')
        .where('id = :id', { id });

      if (blockNumber) {
        selectQueryBuilder = selectQueryBuilder.andWhere('block_number <= :blockNumber', { blockNumber });
      }

      let entity = await selectQueryBuilder.orderBy('pool_day_data.block_number', 'DESC')
        .getOne();

      if (!entity) {
        entity = repo.create({ blockNumber, id, ...values });
        entity = await repo.save(entity);
      }

      return entity;
    });
  }

  async loadPoolHourData ({ id, blockNumber, ...values }: DeepPartial<PoolHourData>): Promise<PoolHourData> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(PoolHourData);

      let selectQueryBuilder = repo.createQueryBuilder('pool_hour_data')
        .where('id = :id', { id });

      if (blockNumber) {
        selectQueryBuilder = selectQueryBuilder.andWhere('block_number <= :blockNumber', { blockNumber });
      }

      let entity = await selectQueryBuilder.orderBy('pool_hour_data.block_number', 'DESC')
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

  async saveBundle (bundle: Bundle, blockNumber: number): Promise<Bundle> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Bundle);
      bundle.blockNumber = blockNumber;
      return repo.save(bundle);
    });
  }

  async savePool (pool: Pool, blockNumber: number): Promise<Pool> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Pool);
      pool.blockNumber = blockNumber;
      return repo.save(pool);
    });
  }

  async savePoolDayData (poolDayData: PoolDayData, blockNumber: number): Promise<PoolDayData> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(PoolDayData);
      poolDayData.blockNumber = blockNumber;
      return repo.save(poolDayData);
    });
  }

  async savePoolHourData (poolHourData: PoolHourData, blockNumber: number): Promise<PoolHourData> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(PoolHourData);
      poolHourData.blockNumber = blockNumber;
      return repo.save(poolHourData);
    });
  }

  async saveToken (token: Token, blockNumber: number): Promise<Token> {
    return this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Token);
      token.blockNumber = blockNumber;
      return repo.save(token);
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
