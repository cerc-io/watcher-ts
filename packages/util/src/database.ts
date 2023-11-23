//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import {
  Between,
  Brackets,
  Connection,
  ConnectionOptions,
  createConnection,
  DeepPartial,
  EntityTarget,
  FindConditions,
  FindManyOptions,
  In,
  ObjectLiteral,
  QueryRunner,
  Repository,
  SelectQueryBuilder,
  WhereExpressionBuilder
} from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import _ from 'lodash';
import { Pool } from 'pg';
import Decimal from 'decimal.js';

import { BlockProgressInterface, ContractInterface, EventInterface, StateInterface, StateSyncStatusInterface, StateKind, SyncStatusInterface } from './types';
import { MAX_REORG_DEPTH, UNKNOWN_EVENT_NAME } from './constants';
import { blockProgressCount, eventCount } from './metrics';

export const OPERATOR_MAP = {
  equals: '=',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  in: 'IN',
  contains: 'LIKE',
  starts: 'LIKE',
  ends: 'LIKE',
  contains_nocase: 'ILIKE',
  starts_nocase: 'ILIKE',
  ends_nocase: 'ILIKE',
  nested: '',
  match: '@@'
};

const INSERT_EVENTS_BATCH = 100;

export interface BlockHeight {
  number?: number;
  hash?: string;
}

export interface CanonicalBlockHeight extends BlockHeight {
  canonicalBlockHashes?: string[];
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
  tsRankBy?: string;
  tsRankValue?: string;
}

export interface Filter {
  // eslint-disable-next-line no-use-before-define
  value: any | Where;
  not: boolean;
  operator?: keyof typeof OPERATOR_MAP;
}

export interface Where {
  // Where[] in case of and / or operators
  // Filter[] in others
  [key: string]: Filter[] | Where[];
}

export type Relation = string | { property: string, alias: string }

export class Database {
  _config: ConnectionOptions;
  _conn!: Connection;
  _pgPool: Pool;

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
    assert(config.type === 'postgres');

    this._pgPool = new Pool({
      user: config.username,
      host: config.host,
      database: config.database,
      password: config.password,
      port: config.port
    });
  }

  get conn (): Connection {
    return this._conn;
  }

  async init (): Promise<Connection> {
    assert(!this._conn);

    this._conn = await createConnection({
      ...this._config,
      namingStrategy: new SnakeNamingStrategy()
    });

    await this._fetchBlockCount();
    await this._fetchEventCount();

    return this._conn;
  }

  async close (): Promise<void> {
    return this._conn.close();
  }

  async createTransactionRunner (): Promise<QueryRunner> {
    const queryRunner = this._conn.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    return queryRunner;
  }

  async getSyncStatus (repo: Repository<SyncStatusInterface>): Promise<SyncStatusInterface | undefined> {
    return repo.findOne();
  }

  async updateSyncStatusIndexedBlock (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const entity = await repo.findOne();
    assert(entity);

    if (force || blockNumber >= entity.latestIndexedBlockNumber) {
      entity.latestIndexedBlockHash = blockHash;
      entity.latestIndexedBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async updateSyncStatusCanonicalBlock (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const entity = await repo.findOne();
    assert(entity);

    if (force || blockNumber >= entity.latestCanonicalBlockNumber) {
      entity.latestCanonicalBlockHash = blockHash;
      entity.latestCanonicalBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async updateSyncStatusChainHead (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    let entity = await repo.findOne();
    if (!entity) {
      entity = repo.create({
        chainHeadBlockHash: blockHash,
        chainHeadBlockNumber: blockNumber,
        latestCanonicalBlockHash: blockHash,
        latestCanonicalBlockNumber: blockNumber,
        latestIndexedBlockHash: '',
        latestIndexedBlockNumber: -1,
        latestProcessedBlockHash: '',
        latestProcessedBlockNumber: -1,
        initialIndexedBlockHash: blockHash,
        initialIndexedBlockNumber: blockNumber
      });
    }

    if (force || blockNumber >= entity.chainHeadBlockNumber) {
      entity.chainHeadBlockHash = blockHash;
      entity.chainHeadBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async updateSyncStatusProcessedBlock (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const entity = await repo.findOne();
    assert(entity);

    if (force || blockNumber >= entity.latestProcessedBlockNumber) {
      entity.latestProcessedBlockHash = blockHash;
      entity.latestProcessedBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async updateSyncStatusIndexingError (repo: Repository<SyncStatusInterface>, hasIndexingError: boolean): Promise<SyncStatusInterface | undefined> {
    const entity = await repo.findOne();

    if (!entity) {
      return;
    }

    entity.hasIndexingError = hasIndexingError;

    return repo.save(entity);
  }

  async updateSyncStatus (repo: Repository<SyncStatusInterface>, syncStatus: DeepPartial<SyncStatusInterface>): Promise<SyncStatusInterface> {
    const entity = await repo.findOne();

    return await repo.save({
      ...entity,
      ...syncStatus
    });
  }

  async getBlockProgress (repo: Repository<BlockProgressInterface>, blockHash: string): Promise<BlockProgressInterface | undefined> {
    return repo.findOne({ where: { blockHash } });
  }

  async getBlockProgressEntities (repo: Repository<BlockProgressInterface>, where: FindConditions<BlockProgressInterface>, options: FindManyOptions<BlockProgressInterface>): Promise<BlockProgressInterface[]> {
    options.where = where;

    return repo.find(options);
  }

  async getBlocksAtHeight (repo: Repository<BlockProgressInterface>, height: number, isPruned: boolean): Promise<BlockProgressInterface[]> {
    return repo.createQueryBuilder('block_progress')
      .where('block_number = :height AND is_pruned = :isPruned', { height, isPruned })
      .getMany();
  }

  async saveBlockProgress (repo: Repository<BlockProgressInterface>, block: DeepPartial<BlockProgressInterface>): Promise<BlockProgressInterface> {
    blockProgressCount.inc(1);

    return await repo.save(block);
  }

  async updateBlockProgress (repo: Repository<BlockProgressInterface>, block: BlockProgressInterface, lastProcessedEventIndex: number): Promise<BlockProgressInterface> {
    if (!block.isComplete) {
      block.lastProcessedEventIndex = lastProcessedEventIndex;
      block.numProcessedEvents++;
    }

    const { generatedMaps } = await repo.createQueryBuilder()
      .update()
      .set(block)
      .where('id = :id', { id: block.id })
      .whereEntity(block)
      .returning('*')
      .execute();

    return generatedMaps[0] as BlockProgressInterface;
  }

  async markBlocksAsPruned (repo: Repository<BlockProgressInterface>, blocks: BlockProgressInterface[]): Promise<void> {
    const ids = blocks.map(({ id }) => id);

    await repo.update({ id: In(ids) }, { isPruned: true });
  }

  async getEvent (repo: Repository<EventInterface>, id: string): Promise<EventInterface | undefined> {
    return repo.findOne(id, { relations: ['block'] });
  }

  async getBlockEvents (repo: Repository<EventInterface>, blockHash: string, where: Where = {}, queryOptions: QueryOptions = {}): Promise<EventInterface[]> {
    let queryBuilder = repo.createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block.block_hash = :blockHash AND block.is_pruned = false', { blockHash });

    queryBuilder = this.buildQuery(repo, queryBuilder, where);

    if (queryOptions.orderBy) {
      queryBuilder = await this.orderQuery(repo, queryBuilder, queryOptions);
    }

    queryBuilder.addOrderBy('event.id', 'ASC');

    if (queryOptions.skip) {
      queryBuilder = queryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      queryBuilder = queryBuilder.limit(queryOptions.limit);
    }

    return queryBuilder.getMany();
  }

  async saveBlockWithEvents (blockRepo: Repository<BlockProgressInterface>, eventRepo: Repository<EventInterface>, block: DeepPartial<BlockProgressInterface>, events: DeepPartial<EventInterface>[]): Promise<BlockProgressInterface> {
    const {
      cid,
      blockHash,
      blockNumber,
      blockTimestamp,
      parentHash
    } = block;

    assert(blockHash);
    assert(blockNumber !== undefined);
    assert(blockNumber > -1);
    assert(blockTimestamp !== undefined);
    assert(blockTimestamp > -1);

    // In a transaction:
    // (1) Save all the events in the database.
    // (2) Add an entry to the block progress table.
    const numEvents = events.length;

    const entity = blockRepo.create({
      cid,
      blockHash,
      parentHash,
      blockNumber,
      blockTimestamp,
      numEvents,
      numProcessedEvents: 0,
      lastProcessedEventIndex: -1,
      isComplete: false
    });

    const blockProgress = await blockRepo.save(entity);
    blockProgressCount.inc(1);

    // Bulk insert events.
    events.forEach(event => {
      event.block = blockProgress;
    });

    await this.saveEvents(eventRepo, events);

    return blockProgress;
  }

  async saveEvents (eventRepo: Repository<EventInterface>, events: DeepPartial<EventInterface>[]): Promise<void> {
    // Bulk insert events.
    const eventBatches = _.chunk(events, INSERT_EVENTS_BATCH);

    const insertPromises = eventBatches.map(async events => {
      await eventRepo.createQueryBuilder()
        .insert()
        .values(events)
        .updateEntity(false)
        .execute();
    });

    await Promise.all(insertPromises);
    const knownEvents = events.filter(event => event.eventName !== UNKNOWN_EVENT_NAME).length;
    eventCount.inc(knownEvents);
  }

  async getEntitiesForBlock (blockHash: string, tableName: string): Promise<any[]> {
    const repo = this._conn.getRepository(tableName);

    const entities = await repo.find({
      where: {
        blockHash
      }
    });

    return entities;
  }

  async getEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindManyOptions<Entity>): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository<Entity>(entity);

    const entities = await repo.find(findConditions);
    return entities;
  }

  async isEntityEmpty<Entity> (entity: new () => Entity): Promise<boolean> {
    const queryRunner = this._conn.createQueryRunner();

    try {
      await queryRunner.connect();
      const data = await this.getEntities(queryRunner, entity);

      if (data.length > 0) {
        return false;
      }

      return true;
    } finally {
      await queryRunner.release();
    }
  }

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindManyOptions<Entity> | FindConditions<Entity>): Promise<void> {
    const repo = queryRunner.manager.getRepository(entity);

    const entities = await repo.find(findConditions);
    await repo.remove(entities);
  }

  async deleteEntitiesByConditions<Entity> (queryRunner: QueryRunner, entity: EntityTarget<Entity>, findConditions: FindConditions<Entity>): Promise<void> {
    const repo = queryRunner.manager.getRepository(entity);

    await repo.delete(findConditions);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    const heirerchicalQuery = `
      WITH RECURSIVE cte_query AS
      (
        SELECT
          block_hash,
          block_number,
          parent_hash,
          0 as depth
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
        cte_query
      ORDER BY block_number ASC
      LIMIT 1;
    `;

    // Get ancestor block hash using heirarchical query.
    const [{ block_hash: ancestorBlockHash }] = await this._conn.query(heirerchicalQuery, [blockHash, depth]);

    return ancestorBlockHash;
  }

  async getProcessedBlockCountForRange (repo: Repository<BlockProgressInterface>, fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    const blockNumbers = _.range(fromBlockNumber, toBlockNumber + 1);
    const expected = blockNumbers.length;

    const { count: actual } = await repo
      .createQueryBuilder('block_progress')
      .select('COUNT(DISTINCT(block_number))', 'count')
      .where('block_number IN (:...blockNumbers) AND is_complete = :isComplete', { blockNumbers, isComplete: true })
      .getRawOne();

    return { expected, actual: parseInt(actual) };
  }

  async getEventsInRange (repo: Repository<EventInterface>, fromBlockNumber: number, toBlockNumber: number): Promise<Array<EventInterface>> {
    const events = repo.createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_number >= :fromBlockNumber AND block_number <= :toBlockNumber AND event_name <> :eventName AND is_pruned = false', {
        fromBlockNumber,
        toBlockNumber,
        eventName: UNKNOWN_EVENT_NAME
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();

    return events;
  }

  async saveEventEntity (repo: Repository<EventInterface>, entity: EventInterface): Promise<EventInterface> {
    const event = await repo.save(entity);
    eventCount.inc(1);

    return event;
  }

  async getFrothyEntity<Entity extends ObjectLiteral> (queryRunner: QueryRunner, repo: Repository<Entity>, data: { blockHash: string, id: string }): Promise<{ blockHash: string, blockNumber: number, id: string }> {
    // Hierarchical query for getting the entity in the frothy region.
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
            "${repo.metadata.tableName}" e
            ON e.block_hash = b.block_hash
            AND e.id = $2
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
              "${repo.metadata.tableName}" e
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
    const result = await queryRunner.query(heirerchicalQuery, [data.blockHash, data.id, MAX_REORG_DEPTH]);

    // Check if empty array returned
    // (occurs when block at given hash doesn't exist in the db)
    if (!result?.length) {
      throw new Error('no block with that hash found');
    }

    const [{ block_hash: blockHash, block_number: blockNumber, id }] = result;

    return { blockHash, blockNumber, id };
  }

  async getPrevEntityVersion<Entity extends ObjectLiteral> (queryRunner: QueryRunner, repo: Repository<Entity>, findOptions: { [key: string]: any }): Promise<Entity | undefined> {
    const { blockHash, blockNumber, id } = await this.getFrothyEntity(queryRunner, repo, findOptions.where);

    if (id) {
      // Entity found in frothy region.
      findOptions.where.blockHash = blockHash;

      return repo.findOne(findOptions);
    }

    return this.getLatestPrunedEntity(repo, findOptions.where.id, blockNumber + 1);
  }

  async getLatestPrunedEntity<Entity extends ObjectLiteral> (repo: Repository<Entity>, id: string, canonicalBlockNumber: number): Promise<Entity | undefined> {
    // Filter out latest entity from pruned blocks.
    const entityInPrunedRegion = await repo.createQueryBuilder('entity')
      .where('entity.id = :id', { id })
      .andWhere('entity.is_pruned = false')
      .andWhere('entity.block_number <= :canonicalBlockNumber', { canonicalBlockNumber })
      .orderBy('entity.block_number', 'DESC')
      .limit(1)
      .getOne();

    return entityInPrunedRegion;
  }

  async getFrothyRegion (queryRunner: QueryRunner, blockHash: string): Promise<{ canonicalBlockNumber: number, blockHashes: string[] }> {
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

  async getContracts (repo: Repository<ContractInterface>): Promise<ContractInterface[]> {
    return repo.createQueryBuilder('contract')
      .getMany();
  }

  async saveContract (repo: Repository<ContractInterface>, address: string, kind: string, checkpoint: boolean, startingBlock: number, context?: any): Promise<ContractInterface> {
    const contract = await repo
      .createQueryBuilder()
      .where('address = :address', { address })
      .getOne();

    const entity = repo.create({ address, kind, checkpoint, startingBlock, context });

    // If contract already present, overwrite fields.
    if (contract) {
      entity.id = contract.id;
    }

    return repo.save(entity);
  }

  async getLatestState (repo: Repository<StateInterface>, contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<StateInterface | undefined> {
    let queryBuilder = repo.createQueryBuilder('state')
      .leftJoinAndSelect('state.block', 'block')
      .where('block.is_pruned = false')
      .andWhere('state.contract_address = :contractAddress', { contractAddress })
      .orderBy('block.block_number', 'DESC');

    // Filter out blocks after the provided block number.
    if (blockNumber) {
      queryBuilder.andWhere('block.block_number <= :blockNumber', { blockNumber });
    }

    // Filter using kind if specified else avoid diff_staged block.
    queryBuilder = kind
      ? queryBuilder.andWhere('state.kind = :kind', { kind })
      : queryBuilder.andWhere('state.kind != :kind', { kind: StateKind.DiffStaged });

    // Get the first three entries.
    queryBuilder.limit(3);

    const results = await queryBuilder.getMany();

    if (results.length) {
      // Sort by (block number desc, id desc) to get the latest entry.
      // At same height, State entries are expected in order ['init', 'diff', 'checkpoint'],
      // and are given preference in order ['checkpoint', 'diff', 'init']
      results.sort((result1, result2) => {
        if (result1.block.blockNumber === result2.block.blockNumber) {
          return (result1.id > result2.id) ? -1 : 1;
        } else {
          return (result1.block.blockNumber > result2.block.blockNumber) ? -1 : 1;
        }
      });

      return results[0];
    }
  }

  async getPrevState (repo: Repository<StateInterface>, blockHash: string, contractAddress: string, kind?: string): Promise<StateInterface | undefined> {
    const heirerchicalQuery = `
      WITH RECURSIVE cte_query AS
      (
        SELECT
          b.block_hash,
          b.block_number,
          b.parent_hash,
          1 as depth,
          s.id,
          s.kind
        FROM
          block_progress b
          LEFT JOIN
            state s ON s.block_id = b.id
            AND s.contract_address = $2
        WHERE
          b.block_hash = $1
        UNION ALL
          SELECT
            b.block_hash,
            b.block_number,
            b.parent_hash,
            c.depth + 1,
            s.id,
            s.kind
          FROM
            block_progress b
            LEFT JOIN
              state s
              ON s.block_id = b.id
              AND s.contract_address = $2
            INNER JOIN
              cte_query c ON c.parent_hash = b.block_hash
            WHERE
              c.depth < $3
      )
      SELECT
        block_number, id, kind
      FROM
        cte_query
      ORDER BY block_number DESC, id DESC
    `;

    // Fetching block and id for previous IPLDBlock in frothy region.
    const queryResult = await repo.query(heirerchicalQuery, [blockHash, contractAddress, MAX_REORG_DEPTH]);
    const latestRequiredResult = kind
      ? queryResult.find((obj: any) => obj.kind === kind)
      : queryResult.find((obj: any) => obj.id);

    let result: StateInterface | undefined;

    if (latestRequiredResult) {
      result = await repo.findOne(latestRequiredResult.id, { relations: ['block'] });
    } else {
      // If State not found in frothy region get latest State in the pruned region.
      // Filter out State entries from pruned blocks.
      const canonicalBlockNumber = queryResult.pop().block_number + 1;

      let queryBuilder = repo.createQueryBuilder('state')
        .leftJoinAndSelect('state.block', 'block')
        .where('block.is_pruned = false')
        .andWhere('state.contract_address = :contractAddress', { contractAddress })
        .andWhere('block.block_number <= :canonicalBlockNumber', { canonicalBlockNumber })
        .orderBy('block.block_number', 'DESC');

      // Filter using kind if specified else order by id to give preference to checkpoint.
      queryBuilder = kind
        ? queryBuilder.andWhere('state.kind = :kind', { kind })
        : queryBuilder.addOrderBy('state.id', 'DESC');

      // Get the first entry.
      queryBuilder.limit(1);

      result = await queryBuilder.getOne();
    }

    return result;
  }

  async getStates (repo: Repository<StateInterface>, where: FindConditions<StateInterface>): Promise<StateInterface[]> {
    return repo.find({ where, relations: ['block'] });
  }

  async getDiffStatesInRange (repo: Repository<StateInterface>, contractAddress: string, startblock: number, endBlock: number): Promise<StateInterface[]> {
    return repo.find({
      relations: ['block'],
      where: {
        contractAddress,
        kind: StateKind.Diff,
        block: {
          isPruned: false,
          blockNumber: Between(startblock + 1, endBlock)
        }
      },
      order: {
        block: 'ASC'
      }
    });
  }

  async saveOrUpdateState (repo: Repository<StateInterface>, state: StateInterface): Promise<StateInterface> {
    let updatedData: {[key: string]: any};

    console.time('time:database#saveOrUpdateState-DB-query');
    if (state.id) {
      // Using pg query as workaround for typeorm memory issue when saving checkpoint with large sized data.
      const { rows } = await this._pgPool.query(`
        UPDATE state
        SET block_id = $1, contract_address = $2, cid = $3, kind = $4, data = $5
        WHERE id = $6
        RETURNING *
      `, [state.block.id, state.contractAddress, state.cid, state.kind, state.data, state.id]);

      updatedData = rows[0];
    } else {
      const { rows } = await this._pgPool.query(`
        INSERT INTO state(block_id, contract_address, cid, kind, data)
        VALUES($1, $2, $3, $4, $5)
        RETURNING *
      `, [state.block.id, state.contractAddress, state.cid, state.kind, state.data]);

      updatedData = rows[0];
    }
    console.timeEnd('time:database#saveOrUpdateState-DB-query');

    assert(updatedData);
    return {
      block: state.block,
      contractAddress: updatedData.contract_address,
      cid: updatedData.cid,
      kind: updatedData.kind,
      data: updatedData.data,
      id: updatedData.id
    };
  }

  async removeStates (repo: Repository<StateInterface>, blockNumber: number, kind: string): Promise<void> {
    const entities = await repo.find({ relations: ['block'], where: { block: { blockNumber }, kind } });

    // Delete if entities found.
    if (entities.length) {
      await repo.delete(entities.map((entity) => entity.id));
    }
  }

  async removeStatesAfterBlock (repo: Repository<StateInterface>, blockNumber: number): Promise<void> {
    // Use raw SQL as TypeORM curently doesn't support delete via 'join' or 'using'
    const deleteQuery = `
      DELETE FROM
        state
      USING block_progress
      WHERE
      state.block_id = block_progress.id
        AND block_progress.block_number > $1;
    `;

    await repo.query(deleteQuery, [blockNumber]);
  }

  async getStateSyncStatus (repo: Repository<StateSyncStatusInterface>): Promise<StateSyncStatusInterface | undefined> {
    return repo.findOne();
  }

  async updateStateSyncStatusIndexedBlock (repo: Repository<StateSyncStatusInterface>, blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface> {
    let entity = await repo.findOne();

    if (!entity) {
      entity = repo.create({
        latestIndexedBlockNumber: blockNumber,
        latestCheckpointBlockNumber: -1
      });
    }

    if (force || blockNumber > entity.latestIndexedBlockNumber) {
      entity.latestIndexedBlockNumber = blockNumber;
    }

    return repo.save(entity);
  }

  async updateStateSyncStatusCheckpointBlock (repo: Repository<StateSyncStatusInterface>, blockNumber: number, force?: boolean): Promise<StateSyncStatusInterface> {
    const entity = await repo.findOne();
    assert(entity);

    if (force || blockNumber > entity.latestCheckpointBlockNumber) {
      entity.latestCheckpointBlockNumber = blockNumber;
    }

    return repo.save(entity);
  }

  buildQuery<Entity extends ObjectLiteral> (
    repo: Repository<Entity>,
    selectQueryBuilder: SelectQueryBuilder<Entity>,
    where: Readonly<Where> = {},
    relations: Readonly<{ [key: string]: any }> = {},
    block: Readonly<CanonicalBlockHeight> = {},
    alias?: string,
    variableSuffix = ''
  ): SelectQueryBuilder<Entity> {
    if (!alias) {
      alias = selectQueryBuilder.alias;
    }

    return selectQueryBuilder.andWhere(this.buildWhereClause(
      repo,
      where,
      relations,
      block,
      alias,
      variableSuffix
    ));
  }

  buildWhereClause<Entity extends ObjectLiteral> (
    repo: Repository<Entity>,
    where: Readonly<Where> = {},
    relations: Readonly<{ [key: string]: any }> = {},
    block: Readonly<CanonicalBlockHeight> = {},
    alias: string,
    variableSuffix?: string
  ): Brackets {
    // Chain resulting where clauses in brackets
    return new Brackets(whereBuilder => {
      Object.entries(where).forEach(([field, filters], whereIndex) => {
        // Handle and / or operators
        if (field === 'and' || field === 'or') {
          this.buildWhereClauseWithLogicalFilter(
            repo,
            whereBuilder,
            filters as Where[],
            field,
            relations,
            block,
            alias,
            `${variableSuffix}_${whereIndex}`
          );

          return;
        }

        filters.forEach((filter, fieldIndex) => {
          let { not, operator, value } = filter as Filter;
          const relation = relations[field];

          // Handle nested relation filter (only one level deep supported)
          if (operator === 'nested' && relation) {
            this.buildWhereClauseWithNestedFilter(
              repo,
              whereBuilder,
              value,
              field,
              relation,
              block,
              alias,
              `${variableSuffix}_${whereIndex}`
            );

            return;
          }

          // Column has to exist if it's not a logical operator or a nested filter
          const columnMetadata = repo.metadata.findColumnWithPropertyName(field);
          assert(columnMetadata);
          const columnIsArray = columnMetadata.isArray;

          // Form the where clause.
          assert(operator);
          let whereClause = '';

          // In case of array field having contains:
          //    NOT comes before the field name
          //    Ignores nocase
          if (columnIsArray && operator.includes('contains')) {
            if (not) {
              whereClause += 'NOT ';
              whereClause += `"${alias}"."${columnMetadata.databaseName}" `;
              whereClause += '&& ';
            } else {
              whereClause += `"${alias}"."${columnMetadata.databaseName}" `;
              whereClause += '@> ';
            }
          } else {
            whereClause += `"${alias}"."${columnMetadata.databaseName}" `;

            if (not) {
              if (operator === 'equals') {
                whereClause += '!';
              } else {
                whereClause += 'NOT ';
              }
            }

            whereClause += `${OPERATOR_MAP[operator]} `;
          }

          value = this._transformBigValues(value);
          if (operator === 'in') {
            whereClause += '(:...';
          } else if (columnMetadata.type === 'tsvector' && operator === 'match') {
            whereClause += 'to_tsquery(:';
          } else {
            whereClause += ':';
          }

          const variableName = `${field}${variableSuffix}_${whereIndex}_${fieldIndex}`;
          whereClause += variableName;

          if (operator === 'in') {
            whereClause += ')';

            if (!value.length) {
              whereClause = 'FALSE';
            }
          }

          if (operator === 'match') {
            whereClause += ')';
          }

          if (!columnIsArray) {
            if (['contains', 'contains_nocase', 'ends', 'ends_nocase'].some(el => el === operator)) {
              value = `%${value}`;
            }

            if (['contains', 'contains_nocase', 'starts', 'starts_nocase'].some(el => el === operator)) {
              value += '%';
            }
          }

          whereBuilder.andWhere(whereClause, { [variableName]: value });
        });
      });
    });
  }

  buildWhereClauseWithLogicalFilter<Entity extends ObjectLiteral> (
    repo: Repository<Entity>,
    whereBuilder: WhereExpressionBuilder,
    wheres: ReadonlyArray<Where> = [],
    operator: 'and' | 'or',
    relations: Readonly<{ [key: string]: any }> = {},
    block: Readonly<CanonicalBlockHeight> = {},
    alias: string,
    variableSuffix?: string
  ): void {
    switch (operator) {
      case 'and': {
        whereBuilder.andWhere(new Brackets(andWhereBuilder => {
          // Chain all where clauses using AND
          wheres.forEach(w => {
            andWhereBuilder.andWhere(this.buildWhereClause(
              repo,
              w,
              relations,
              block,
              alias,
              variableSuffix
            ));
          });
        }));

        break;
      }

      case 'or': {
        whereBuilder.andWhere(new Brackets(orWhereBuilder => {
          // Chain all where clauses using OR
          wheres.forEach(w => {
            orWhereBuilder.orWhere(this.buildWhereClause(
              repo,
              w,
              relations,
              block,
              alias,
              variableSuffix
            ));
          });
        }));

        break;
      }
    }
  }

  buildWhereClauseWithNestedFilter<Entity extends ObjectLiteral> (
    repo: Repository<Entity>,
    whereBuilder: WhereExpressionBuilder,
    where: Readonly<Where> = {},
    field: string,
    relation: Readonly<any> = {},
    block: Readonly<CanonicalBlockHeight> = {},
    alias: string,
    variableSuffix?: string
  ): void {
    const relationRepo = this.conn.getRepository<any>(relation.entity);
    const relationTableName = relationRepo.metadata.tableName;
    let relationSubQuery: SelectQueryBuilder<any> = relationRepo.createQueryBuilder(relationTableName, repo.queryRunner)
      .select('1');

    if (relation.isDerived) {
      const derivationField = relation.field;
      relationSubQuery = relationSubQuery.where(`${relationTableName}.${derivationField} = ${alias}.id`);
    } else {
      // Column has to exist for non-derived fields
      const columnMetadata = repo.metadata.findColumnWithPropertyName(field);
      assert(columnMetadata);

      if (relation.isArray) {
        relationSubQuery = relationSubQuery.where(`${relationTableName}.id = ANY("${alias}".${columnMetadata.databaseName})`);
      } else {
        relationSubQuery = relationSubQuery.where(`${relationTableName}.id = "${alias}".${columnMetadata.databaseName}`);
      }
    }

    // canonicalBlockHashes take precedence over block number if provided
    if (block.canonicalBlockHashes) {
      relationSubQuery = relationSubQuery
        .andWhere(new Brackets(qb => {
          qb.where(`${relationTableName}.block_hash IN (:...relationBlockHashes)`, { relationBlockHashes: block.canonicalBlockHashes })
            .orWhere(`${relationTableName}.block_number <= :relationCanonicalBlockNumber`, { relationCanonicalBlockNumber: block.number });
        }));
    } else if (block.number) {
      relationSubQuery = relationSubQuery.andWhere(`${relationTableName}.block_number <= :blockNumber`, { blockNumber: block.number });
    }

    relationSubQuery = this.buildQuery(relationRepo, relationSubQuery, where, {}, block, undefined, variableSuffix);
    whereBuilder.andWhere(`EXISTS (${relationSubQuery.getQuery()})`, relationSubQuery.getParameters());
  }

  async orderQuery<Entity extends ObjectLiteral> (
    repo: Repository<Entity>,
    selectQueryBuilder: SelectQueryBuilder<Entity>,
    orderOptions: { orderBy?: string, orderDirection?: string },
    relations: Readonly<{ [key: string]: any }> = {},
    block: Readonly<CanonicalBlockHeight> = {},
    columnPrefix = '',
    alias?: string
  ): Promise<SelectQueryBuilder<Entity>> {
    if (!alias) {
      alias = selectQueryBuilder.alias;
    }

    const { orderBy: orderByWithSuffix, orderDirection } = orderOptions;
    assert(orderByWithSuffix);

    // Nested sort key of form relationField__relationColumn
    const [orderBy, suffix] = orderByWithSuffix.split('__');

    const columnMetadata = repo.metadata.findColumnWithPropertyName(orderBy);
    const relation = relations[orderBy];

    // Ordering by array / derived type fields not supported
    if (columnMetadata?.isArray || relation?.isDerived) {
      throw new Error(`Ordering by \`${orderBy}\` is not supported for type \`${repo.metadata.name}\``);
    }

    // Handle nested entity sort
    if (suffix && relation) {
      return this.orderQueryNested(
        repo,
        selectQueryBuilder,
        { relationField: orderBy, orderBy: suffix, orderDirection },
        relation,
        block,
        columnPrefix,
        alias
      );
    }

    assert(columnMetadata);
    return selectQueryBuilder.addOrderBy(
      `"${alias}"."${columnPrefix}${columnMetadata.databaseName}"`,
      orderDirection === 'desc' ? 'DESC' : 'ASC'
    );
  }

  async orderQueryNested<Entity extends ObjectLiteral> (
    repo: Repository<Entity>,
    selectQueryBuilder: SelectQueryBuilder<Entity>,
    orderOptions: { relationField: string, orderBy: string, orderDirection?: string },
    relation: Readonly<any> = {},
    block: Readonly<CanonicalBlockHeight> = {},
    columnPrefix = '',
    alias: string
  ): Promise<SelectQueryBuilder<Entity>> {
    const { relationField, orderBy, orderDirection } = orderOptions;

    const columnMetadata = repo.metadata.findColumnWithPropertyName(relationField);
    assert(columnMetadata);

    const relationRepo = this.conn.getRepository<any>(relation.entity);
    const relationTableName = relationRepo.metadata.tableName;

    const relationColumnMetaData = relationRepo.metadata.findColumnWithPropertyName(orderBy);
    assert(relationColumnMetaData);

    const queryRunner = repo.queryRunner;
    assert(queryRunner);

    // Perform a groupBy(id) and max(block number) to get the latest version of related entities
    let subQuery = relationRepo.createQueryBuilder('subTable', queryRunner)
      .select('subTable.id', 'id')
      .addSelect('MAX(subTable.block_number)', 'block_number')
      .where('subTable.is_pruned = :isPruned', { isPruned: false })
      .groupBy('subTable.id');

    subQuery = await this.applyBlockHeightFilter(queryRunner, subQuery, block, 'subTable');

    // Self join to select required columns
    const latestRelatedEntitiesAlias = `latest${relationField}Entities`;
    const relationSubQuery: SelectQueryBuilder<any> = relationRepo.createQueryBuilder(relationTableName, queryRunner)
      .select(`${relationTableName}.id`, 'id')
      .addSelect(`${relationTableName}.${relationColumnMetaData.databaseName}`, `${relationColumnMetaData.databaseName}`)
      .innerJoin(
        `(${subQuery.getQuery()})`,
        latestRelatedEntitiesAlias,
        `${relationTableName}.id = "${latestRelatedEntitiesAlias}"."id" AND ${relationTableName}.block_number = "${latestRelatedEntitiesAlias}"."block_number"`
      )
      .setParameters(subQuery.getParameters());

    // Join with related table to get the required field to sort on
    const relatedEntitiesAlias = `related${relationField}`;
    selectQueryBuilder = selectQueryBuilder
      .innerJoin(
        `(${relationSubQuery.getQuery()})`,
        relatedEntitiesAlias,
        `"${alias}"."${columnPrefix}${columnMetadata.databaseName}" = "${relatedEntitiesAlias}".id`
      )
      .setParameters(relationSubQuery.getParameters());

    // Apply sort
    return selectQueryBuilder
      .addSelect(`"${relatedEntitiesAlias}"."${relationColumnMetaData.databaseName}"`)
      .addOrderBy(
        `"${relatedEntitiesAlias}"."${relationColumnMetaData.databaseName}"`,
        orderDirection === 'desc' ? 'DESC' : 'ASC'
      );
  }

  orderTsQuery<Entity extends ObjectLiteral> (
    repo: Repository<Entity>,
    selectQueryBuilder: SelectQueryBuilder<Entity>,
    tsOrderOptions: { tsRankBy?: string, tsRankValue?: string },
    columnPrefix = '',
    alias?: string
  ): SelectQueryBuilder<Entity> {
    if (!alias) {
      alias = selectQueryBuilder.alias;
    }

    const { tsRankBy, tsRankValue } = tsOrderOptions;
    assert(tsRankBy);

    const columnMetadata = repo.metadata.findColumnWithPropertyName(tsRankBy);
    assert(columnMetadata);

    const tsOrderBy = `ts_rank("${alias}"."${columnPrefix}${columnMetadata.databaseName}", to_tsquery('${tsRankValue ?? ''}'))`;

    return selectQueryBuilder.addOrderBy(
      tsOrderBy,
      'ASC'
    );
  }

  async applyBlockHeightFilter<Entity> (
    queryRunner: QueryRunner,
    queryBuilder: SelectQueryBuilder<Entity>,
    block: CanonicalBlockHeight,
    alias: string
  ): Promise<SelectQueryBuilder<Entity>> {
    // Block hash takes precedence over number if provided
    if (block.hash) {
      if (!block.canonicalBlockHashes) {
        const { canonicalBlockNumber, blockHashes } = await this.getFrothyRegion(queryRunner, block.hash);

        // Update the block field to avoid firing the same query further
        block.number = canonicalBlockNumber;
        block.canonicalBlockHashes = blockHashes;
      }

      queryBuilder = queryBuilder
        .andWhere(new Brackets(qb => {
          qb.where(`${alias}.block_hash IN (:...blockHashes)`, { blockHashes: block.canonicalBlockHashes })
            .orWhere(`${alias}.block_number <= :canonicalBlockNumber`, { canonicalBlockNumber: block.number });
        }));
    } else if (block.number) {
      queryBuilder = queryBuilder.andWhere(`${alias}.block_number <= :blockNumber`, { blockNumber: block.number });
    }

    return queryBuilder;
  }

  async _fetchBlockCount (): Promise<void> {
    const res = await this._conn.getRepository('block_progress')
      .count();

    blockProgressCount.set(res);
  }

  async _fetchEventCount (): Promise<void> {
    const res = await this._conn.getRepository('event')
      .count();

    eventCount.set(res);
  }

  _transformBigValues (value: any): any {
    // Handle array of bigints
    if (Array.isArray(value)) {
      if (value.length > 0 && (typeof value[0] === 'bigint' || Decimal.isDecimal(value[0]))) {
        return value.map(val => {
          return val.toString();
        });
      }
    }

    // Handle bigint
    if (typeof value === 'bigint' || Decimal.isDecimal(value)) {
      return value.toString();
    }

    return value;
  }
}
