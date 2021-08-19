//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { Brackets, Connection, ConnectionOptions, DeepPartial, FindConditions, FindOneOptions, LessThanOrEqual, QueryRunner, Repository } from 'typeorm';

import { MAX_REORG_DEPTH, Database as BaseDatabase } from '@vulcanize/util';

import { EventSyncProgress } from './entity/EventProgress';
import { Factory } from './entity/Factory';
import { Pool } from './entity/Pool';
import { Event } from './entity/Event';
import { Token } from './entity/Token';
import { Bundle } from './entity/Bundle';
import { PoolDayData } from './entity/PoolDayData';
import { PoolHourData } from './entity/PoolHourData';
import { Transaction } from './entity/Transaction';
import { Mint } from './entity/Mint';
import { UniswapDayData } from './entity/UniswapDayData';
import { Tick } from './entity/Tick';
import { TokenDayData } from './entity/TokenDayData';
import { TokenHourData } from './entity/TokenHourData';
import { Burn } from './entity/Burn';
import { Swap } from './entity/Swap';
import { Position } from './entity/Position';
import { PositionSnapshot } from './entity/PositionSnapshot';
import { BlockProgress } from './entity/BlockProgress';
import { Block } from './events';
import { SyncStatus } from './entity/SyncStatus';

const DEFAULT_LIMIT = 100;
const DEFAULT_SKIP = 0;

const OPERATOR_MAP = {
  equals: '=',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  in: 'IN',
  contains: 'LIKE',
  starts: 'LIKE',
  ends: 'LIKE'
};

export interface BlockHeight {
  number?: number;
  hash?: string;
}

export enum OrderDirection {
  asc = 'asc',
  desc = 'desc'
}

export interface QueryOptions {
  limit?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: OrderDirection;
}

interface Where {
  [key: string]: [{
    value: any;
    not: boolean;
    operator: keyof typeof OPERATOR_MAP;
  }]
}

export class Database {
  _config: ConnectionOptions
  _conn!: Connection
  _baseDatabase: BaseDatabase

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
    this._baseDatabase = new BaseDatabase(this._config);
  }

  async init (): Promise<void> {
    this._conn = await this._baseDatabase.init();
  }

  async close (): Promise<void> {
    return this._baseDatabase.close();
  }

  async createTransactionRunner (): Promise<QueryRunner> {
    return this._baseDatabase.createTransactionRunner();
  }

  async getFactory (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<Factory>): Promise<Factory | undefined> {
    const repo = queryRunner.manager.getRepository(Factory);
    const whereOptions: FindConditions<Factory> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<Factory>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getBundle (queryRunner: QueryRunner, { id, blockHash, blockNumber }: DeepPartial<Bundle>): Promise<Bundle | undefined> {
    const repo = queryRunner.manager.getRepository(Bundle);
    const whereOptions: FindConditions<Bundle> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<Bundle>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getToken (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<Token>): Promise<Token | undefined> {
    const repo = queryRunner.manager.getRepository(Token);
    const whereOptions: FindConditions<Token> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      relations: ['whitelistPools', 'whitelistPools.token0', 'whitelistPools.token1'],
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<Token>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getTokenNoTx ({ id, blockHash }: DeepPartial<Token>): Promise<Token | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getToken(queryRunner, { id, blockHash });
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async getPool (queryRunner: QueryRunner, { id, blockHash, blockNumber }: DeepPartial<Pool>): Promise<Pool | undefined> {
    const repo = queryRunner.manager.getRepository(Pool);
    const whereOptions: FindConditions<Pool> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions = {
      where: whereOptions,
      relations: ['token0', 'token1'],
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<Pool>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getPoolNoTx ({ id, blockHash, blockNumber }: DeepPartial<Pool>): Promise<Pool | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getPool(queryRunner, { id, blockHash, blockNumber });
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async getPosition ({ id, blockHash }: DeepPartial<Position>): Promise<Position | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let entity;

    try {
      await queryRunner.connect();
      const repo = queryRunner.manager.getRepository(Position);
      const whereOptions: FindConditions<Position> = { id };

      if (blockHash) {
        whereOptions.blockHash = blockHash;
      }

      const findOptions = {
        where: whereOptions,
        relations: ['pool', 'token0', 'token1', 'tickLower', 'tickUpper', 'transaction'],
        order: {
          blockNumber: 'DESC'
        }
      };

      entity = await repo.findOne(findOptions as FindOneOptions<Position>);

      if (!entity && findOptions.where.blockHash) {
        entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
      }
    } finally {
      await queryRunner.release();
    }

    return entity;
  }

  async getTick (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<Tick>): Promise<Tick | undefined> {
    const repo = queryRunner.manager.getRepository(Tick);
    const whereOptions: FindConditions<Tick> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      relations: ['pool'],
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<Tick>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getTickNoTx ({ id, blockHash }: DeepPartial<Tick>): Promise<Tick | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getTick(queryRunner, { id, blockHash });
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async getPoolDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<PoolDayData>): Promise<PoolDayData | undefined> {
    const repo = queryRunner.manager.getRepository(PoolDayData);
    const whereOptions: FindConditions<PoolDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      },
      relations: ['pool']
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<PoolDayData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getPoolHourData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<PoolHourData>): Promise<PoolHourData | undefined> {
    const repo = queryRunner.manager.getRepository(PoolHourData);
    const whereOptions: FindConditions<PoolHourData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<PoolHourData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getUniswapDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<UniswapDayData>): Promise<UniswapDayData | undefined> {
    const repo = queryRunner.manager.getRepository(UniswapDayData);
    const whereOptions: FindConditions<UniswapDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<UniswapDayData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getTokenDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<TokenDayData>): Promise<TokenDayData | undefined> {
    const repo = queryRunner.manager.getRepository(TokenDayData);
    const whereOptions: FindConditions<TokenDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<TokenDayData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getTokenHourData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<TokenHourData>): Promise<TokenHourData | undefined> {
    const repo = queryRunner.manager.getRepository(TokenHourData);
    const whereOptions: FindConditions<TokenHourData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<TokenHourData>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getTransaction (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<Transaction>): Promise<Transaction | undefined> {
    const repo = queryRunner.manager.getRepository(Transaction);
    const whereOptions: FindConditions<Transaction> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<Transaction>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async getEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, block: BlockHeight, where: Where = {}, queryOptions: QueryOptions = {}, relations: string[] = []): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entity);
    const { tableName } = repo.metadata;

    let subQuery = repo.createQueryBuilder('subTable')
      .select('MAX(subTable.block_number)')
      .where(`subTable.id = ${tableName}.id`);

    if (block.hash) {
      const { canonicalBlockNumber, blockHashes } = await this._getFrothyRegion(queryRunner, block.hash);

      subQuery = subQuery
        .andWhere(new Brackets(qb => {
          qb.where('subTable.block_hash IN (:...blockHashes)', { blockHashes })
            .orWhere('subTable.block_number <= :canonicalBlockNumber', { canonicalBlockNumber });
        }));
    }

    if (block.number) {
      subQuery = subQuery.andWhere('subTable.block_number <= :blockNumber', { blockNumber: block.number });
    }

    let selectQueryBuilder = repo.createQueryBuilder(tableName)
      .where(`${tableName}.block_number IN (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters());

    relations.forEach(relation => {
      selectQueryBuilder = selectQueryBuilder.leftJoinAndSelect(`${repo.metadata.tableName}.${relation}`, relation);
    });

    Object.entries(where).forEach(([field, filters]) => {
      filters.forEach((filter, index) => {
        // Form the where clause.
        const { not, operator, value } = filter;
        const columnMetadata = repo.metadata.findColumnWithPropertyName(field);
        assert(columnMetadata);
        let whereClause = `${tableName}.${columnMetadata.propertyAliasName} `;

        if (not) {
          if (operator === 'equals') {
            whereClause += '!';
          } else {
            whereClause += 'NOT ';
          }
        }

        whereClause += `${OPERATOR_MAP[operator]} `;

        if (['contains', 'starts'].some(el => el === operator)) {
          whereClause += '%:';
        } else if (operator === 'in') {
          whereClause += '(:...';
        } else {
          whereClause += ':';
        }

        const variableName = `${field}${index}`;
        whereClause += variableName;

        if (['contains', 'ends'].some(el => el === operator)) {
          whereClause += '%';
        } else if (operator === 'in') {
          whereClause += ')';
        }

        selectQueryBuilder = selectQueryBuilder.andWhere(whereClause, { [variableName]: value });
      });
    });

    const { limit = DEFAULT_LIMIT, orderBy, orderDirection, skip = DEFAULT_SKIP } = queryOptions;

    selectQueryBuilder = selectQueryBuilder.skip(skip)
      .take(limit);

    if (orderBy) {
      const columnMetadata = repo.metadata.findColumnWithPropertyName(orderBy);
      assert(columnMetadata);
      selectQueryBuilder = selectQueryBuilder.orderBy(`${tableName}.${columnMetadata.propertyAliasName}`, orderDirection === 'desc' ? 'DESC' : 'ASC');
    }

    return selectQueryBuilder.getMany();
  }

  async saveFactory (queryRunner: QueryRunner, factory: Factory, block: Block): Promise<Factory> {
    const repo = queryRunner.manager.getRepository(Factory);
    factory.blockNumber = block.number;
    factory.blockHash = block.hash;
    return repo.save(factory);
  }

  async saveBundle (queryRunner: QueryRunner, bundle: Bundle, block: Block): Promise<Bundle> {
    const repo = queryRunner.manager.getRepository(Bundle);
    bundle.blockNumber = block.number;
    bundle.blockHash = block.hash;
    return repo.save(bundle);
  }

  async savePool (queryRunner: QueryRunner, pool: Pool, block: Block): Promise<Pool> {
    const repo = queryRunner.manager.getRepository(Pool);
    pool.blockNumber = block.number;
    pool.blockHash = block.hash;
    return repo.save(pool);
  }

  async savePoolDayData (queryRunner: QueryRunner, poolDayData: PoolDayData, block: Block): Promise<PoolDayData> {
    const repo = queryRunner.manager.getRepository(PoolDayData);
    poolDayData.blockNumber = block.number;
    poolDayData.blockHash = block.hash;
    return repo.save(poolDayData);
  }

  async savePoolHourData (queryRunner: QueryRunner, poolHourData: PoolHourData, block: Block): Promise<PoolHourData> {
    const repo = queryRunner.manager.getRepository(PoolHourData);
    poolHourData.blockNumber = block.number;
    poolHourData.blockHash = block.hash;
    return repo.save(poolHourData);
  }

  async saveToken (queryRunner: QueryRunner, token: Token, block: Block): Promise<Token> {
    const repo = queryRunner.manager.getRepository(Token);
    token.blockNumber = block.number;
    token.blockHash = block.hash;
    return repo.save(token);
  }

  async saveTransaction (queryRunner: QueryRunner, transaction: Transaction, block: Block): Promise<Transaction> {
    const repo = queryRunner.manager.getRepository(Transaction);
    transaction.blockNumber = block.number;
    transaction.blockHash = block.hash;
    return repo.save(transaction);
  }

  async saveUniswapDayData (queryRunner: QueryRunner, uniswapDayData: UniswapDayData, block: Block): Promise<UniswapDayData> {
    const repo = queryRunner.manager.getRepository(UniswapDayData);
    uniswapDayData.blockNumber = block.number;
    uniswapDayData.blockHash = block.hash;
    return repo.save(uniswapDayData);
  }

  async saveTokenDayData (queryRunner: QueryRunner, tokenDayData: TokenDayData, block: Block): Promise<TokenDayData> {
    const repo = queryRunner.manager.getRepository(TokenDayData);
    tokenDayData.blockNumber = block.number;
    tokenDayData.blockHash = block.hash;
    return repo.save(tokenDayData);
  }

  async saveTokenHourData (queryRunner: QueryRunner, tokenHourData: TokenHourData, block: Block): Promise<TokenHourData> {
    const repo = queryRunner.manager.getRepository(TokenHourData);
    tokenHourData.blockNumber = block.number;
    tokenHourData.blockHash = block.hash;
    return repo.save(tokenHourData);
  }

  async saveTick (queryRunner: QueryRunner, tick: Tick, block: Block): Promise<Tick> {
    const repo = queryRunner.manager.getRepository(Tick);
    tick.blockNumber = block.number;
    tick.blockHash = block.hash;
    return repo.save(tick);
  }

  async savePosition (queryRunner: QueryRunner, position: Position, block: Block): Promise<Position> {
    const repo = queryRunner.manager.getRepository(Position);
    position.blockNumber = block.number;
    position.blockHash = block.hash;
    return repo.save(position);
  }

  async savePositionSnapshot (queryRunner: QueryRunner, positionSnapshot: PositionSnapshot, block: Block): Promise<PositionSnapshot> {
    const repo = queryRunner.manager.getRepository(PositionSnapshot);
    positionSnapshot.blockNumber = block.number;
    positionSnapshot.blockHash = block.hash;
    return repo.save(positionSnapshot);
  }

  async saveMint (queryRunner: QueryRunner, mint: Mint, block: Block): Promise<Mint> {
    const repo = queryRunner.manager.getRepository(Mint);
    mint.blockNumber = block.number;
    mint.blockHash = block.hash;
    return repo.save(mint);
  }

  async saveBurn (queryRunner: QueryRunner, burn: Burn, block: Block): Promise<Burn> {
    const repo = queryRunner.manager.getRepository(Burn);
    burn.blockNumber = block.number;
    burn.blockHash = block.hash;
    return repo.save(burn);
  }

  async saveSwap (queryRunner: QueryRunner, swap: Swap, block: Block): Promise<Swap> {
    const repo = queryRunner.manager.getRepository(Swap);
    swap.blockNumber = block.number;
    swap.blockHash = block.hash;
    return repo.save(swap);
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

  async getBlockEvents (blockHash: string): Promise<Event[]> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash', { blockHash })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async getEvents ({ blockHash, token }: { blockHash: string, token: string }): Promise<Event[]> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash AND token = :token', {
        blockHash,
        token
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async getEventsByName ({ blockHash, token, eventName }: { blockHash: string, token: string, eventName: string }): Promise<Event[] | undefined> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash AND token = :token AND :eventName = :eventName', {
        blockHash,
        token,
        eventName
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async saveEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgress>, events: DeepPartial<Event>[]): Promise<void> {
    const {
      blockHash,
      blockNumber,
      blockTimestamp,
      parentHash
    } = block;

    assert(blockHash);
    assert(blockNumber);
    assert(blockTimestamp);
    assert(parentHash);

    // In a transaction:
    // (1) Save all the events in the database.
    // (2) Add an entry to the block progress table.
    const numEvents = events.length;
    const blockProgressRepo = queryRunner.manager.getRepository(BlockProgress);
    let blockProgress = await blockProgressRepo.findOne({ where: { blockHash } });

    if (!blockProgress) {
      const entity = blockProgressRepo.create({
        blockHash,
        parentHash,
        blockNumber,
        blockTimestamp,
        numEvents,
        numProcessedEvents: 0,
        lastProcessedEventIndex: -1,
        isComplete: (numEvents === 0)
      });

      blockProgress = await blockProgressRepo.save(entity);

      // Bulk insert events.
      events.forEach(event => { event.block = blockProgress; });
      await queryRunner.manager.createQueryBuilder().insert().into(Event).values(events).execute();
    }
  }

  async updateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusIndexedBlock(repo, blockHash, blockNumber);
  }

  async updateSyncStatusCanonicalBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusCanonicalBlock(repo, blockHash, blockNumber);
  }

  async updateSyncStatusChainHead (queryRunner: QueryRunner, blockHash: string, blockNumber: number): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusChainHead(repo, blockHash, blockNumber);
  }

  async getSyncStatus (queryRunner: QueryRunner): Promise<SyncStatus | undefined> {
    const repo = queryRunner.manager.getRepository(SyncStatus);
    return repo.findOne();
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._conn.getRepository(Event).findOne(id, { relations: ['block'] });
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getBlocksAtHeight(repo, height, isPruned);
  }

  async markBlockAsPruned (queryRunner: QueryRunner, block: BlockProgress): Promise<BlockProgress> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.markBlockAsPruned(repo, block);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    const repo = this._conn.getRepository(BlockProgress);
    return repo.findOne({ where: { blockHash } });
  }

  async updateBlockProgress (queryRunner: QueryRunner, blockHash: string, lastProcessedEventIndex: number): Promise<void> {
    const repo = queryRunner.manager.getRepository(BlockProgress);
    const entity = await repo.findOne({ where: { blockHash } });
    if (entity && !entity.isComplete) {
      if (lastProcessedEventIndex <= entity.lastProcessedEventIndex) {
        throw new Error(`Events processed out of order ${blockHash}, was ${entity.lastProcessedEventIndex}, got ${lastProcessedEventIndex}`);
      }

      entity.lastProcessedEventIndex = lastProcessedEventIndex;
      entity.numProcessedEvents++;
      if (entity.numProcessedEvents >= entity.numEvents) {
        entity.isComplete = true;
      }

      await repo.save(entity);
    }
  }

  async _getPrevEntityVersion<Entity> (queryRunner: QueryRunner, repo: Repository<Entity>, findOptions: { [key: string]: any }): Promise<Entity | undefined> {
    // Check whether query is ordered by blockNumber to get the latest entity.
    assert(findOptions.order.blockNumber);

    // Hierarchical query for getting the entity in the frothy region.
    // TODO: Use syncStatus.latestCanonicalBlockNumber instead of MAX_REORG_DEPTH after pruning is implemented.
    const heirerchicalQuery = `
      WITH RECURSIVE cte_query AS
      (
        SELECT
          b.block_hash,
          b.block_number,
          b.parent_hash,
          1 as depth,
          e.id
        FROM
          block_progress b
          LEFT JOIN
            ${repo.metadata.tableName} e ON e.block_hash = b.block_hash
        WHERE
          b.block_hash = $1
        UNION ALL
          SELECT
            b.block_hash,
            b.block_number,
            b.parent_hash,
            c.depth + 1,
            e.id
          FROM
            block_progress b
            LEFT JOIN
              ${repo.metadata.tableName} e
              ON e.block_hash = b.block_hash
              AND e.id = $2
            INNER JOIN
              cte_query c ON c.parent_hash = b.block_hash
            WHERE
              c.id IS NULL AND c.depth < $3
      )
      SELECT
        block_hash, block_number, id
      FROM
        cte_query
      ORDER BY block_number ASC
      LIMIT 1;
    `;

    // Fetching blockHash for previous entity in frothy region.
    const [{ block_hash: blockHash, block_number: blockNumber, id }] = await queryRunner.query(heirerchicalQuery, [findOptions.where.blockHash, findOptions.where.id, MAX_REORG_DEPTH]);

    if (id) {
      // Entity found in frothy region.
      findOptions.where.blockHash = blockHash;
      return repo.findOne(findOptions);
    }

    // If entity not found in frothy region get latest entity in the pruned region.
    delete findOptions.where.blockHash;
    const canonicalBlockNumber = blockNumber + 1;
    findOptions.where.blockNumber = LessThanOrEqual(canonicalBlockNumber);
    return repo.findOne(findOptions);
  }

  async _getFrothyRegion (queryRunner: QueryRunner, blockHash: string): Promise<{ canonicalBlockNumber: number, blockHashes: string[] }> {
    // TODO: Use syncStatus.latestCanonicalBlockNumber instead of MAX_REORG_DEPTH after pruning is implemented.
    const heirerchicalQuery = `
      WITH RECURSIVE cte_query AS
      (
        SELECT
          block_hash,
          block_number,
          parent_hash,
          1 as depth
        FROM
          block_progress
        WHERE
          block_hash = $1
        UNION ALL
          SELECT
            b.block_hash,
            b.block_number,
            b.parent_hash,
            c.depth + 1
          FROM
            block_progress b
          INNER JOIN
            cte_query c ON c.parent_hash = b.block_hash
          WHERE
            c.depth < $2
      )
      SELECT
        block_hash, block_number
      FROM
        cte_query;
    `;

    // Get blocks in the frothy region using heirarchical query.
    const blocks = await queryRunner.query(heirerchicalQuery, [blockHash, MAX_REORG_DEPTH]);
    const blockHashes = blocks.map(({ block_hash: blockHash }: any) => blockHash);

    // Canonical block is the block after the last block in frothy region.
    const canonicalBlockNumber = blocks[blocks.length - 1].block_number + 1;

    return { canonicalBlockNumber, blockHashes };
  }
}
