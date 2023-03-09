//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import {
  Between,
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
  SelectQueryBuilder
} from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import _ from 'lodash';
import { Pool } from 'pg';

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
  ends: 'LIKE'
};

const INSERT_EVENTS_BATCH = 100;

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

export interface Where {
  [key: string]: [{
    value: any;
    not: boolean;
    operator: keyof typeof OPERATOR_MAP;
  }]
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
      if (lastProcessedEventIndex <= block.lastProcessedEventIndex) {
        throw new Error(`Events processed out of order ${block.blockHash}, was ${block.lastProcessedEventIndex}, got ${lastProcessedEventIndex}`);
      }

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
      queryBuilder = this.orderQuery(repo, queryBuilder, queryOptions);
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
    const repo = queryRunner.manager.getRepository(entity);

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
            ${repo.metadata.tableName} e
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
    const [{ block_hash: blockHash, block_number: blockNumber, id }] = await queryRunner.query(heirerchicalQuery, [data.blockHash, data.id, MAX_REORG_DEPTH]);

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

  async saveContract (repo: Repository<ContractInterface>, address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<ContractInterface> {
    const contract = await repo
      .createQueryBuilder()
      .where('address = :address', { address })
      .getOne();

    const entity = repo.create({ address, kind, checkpoint, startingBlock });

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
    where: Where = {},
    alias?: string
  ): SelectQueryBuilder<Entity> {
    if (!alias) {
      alias = selectQueryBuilder.alias;
    }

    Object.entries(where).forEach(([field, filters]) => {
      filters.forEach((filter, index) => {
        // Form the where clause.
        let { not, operator, value } = filter;
        const columnMetadata = repo.metadata.findColumnWithPropertyName(field);
        assert(columnMetadata);
        let whereClause = `"${alias}"."${columnMetadata.databaseName}" `;

        if (columnMetadata.relationMetadata) {
          // For relation fields, use the id column.
          const idColumn = columnMetadata.relationMetadata.joinColumns.find(column => column.referencedColumn?.propertyName === 'id');
          assert(idColumn);
          whereClause = `"${alias}"."${idColumn.databaseName}" `;
        }

        if (not) {
          if (operator === 'equals') {
            whereClause += '!';
          } else {
            whereClause += 'NOT ';
          }
        }

        whereClause += `${OPERATOR_MAP[operator]} `;

        if (operator === 'in') {
          whereClause += '(:...';
        } else {
          // Convert to string type value as bigint type throws error in query.
          value = value.toString();

          whereClause += ':';
        }

        const variableName = `${field}${index}`;
        whereClause += variableName;

        if (operator === 'in') {
          whereClause += ')';

          if (!value.length) {
            whereClause = 'FALSE';
          }
        }

        if (['contains', 'starts'].some(el => el === operator)) {
          value = `%${value}`;
        }

        if (['contains', 'ends'].some(el => el === operator)) {
          value += '%';
        }

        selectQueryBuilder = selectQueryBuilder.andWhere(whereClause, { [variableName]: value });
      });
    });

    return selectQueryBuilder;
  }

  orderQuery<Entity extends ObjectLiteral> (
    repo: Repository<Entity>,
    selectQueryBuilder: SelectQueryBuilder<Entity>,
    orderOptions: { orderBy?: string, orderDirection?: string },
    columnPrefix = '',
    alias?: string
  ): SelectQueryBuilder<Entity> {
    if (!alias) {
      alias = selectQueryBuilder.alias;
    }

    const { orderBy, orderDirection } = orderOptions;
    assert(orderBy);

    const columnMetadata = repo.metadata.findColumnWithPropertyName(orderBy);
    assert(columnMetadata);

    return selectQueryBuilder.addOrderBy(
      `"${alias}"."${columnPrefix}${columnMetadata.databaseName}"`,
      orderDirection === 'desc' ? 'DESC' : 'ASC'
    );
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
}
