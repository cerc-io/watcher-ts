//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import {
  Brackets,
  Connection,
  FindOneOptions,
  In,
  LessThanOrEqual,
  MoreThan,
  QueryRunner,
  Repository,
  SelectQueryBuilder,
  UpdateResult,
  ObjectLiteral
} from 'typeorm';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import { RawSqlResultsToEntityTransformer } from 'typeorm/query-builder/transformer/RawSqlResultsToEntityTransformer';
import { SelectionNode } from 'graphql';
import _ from 'lodash';
import debug from 'debug';

import { BlockHeight, Database as BaseDatabase, QueryOptions, Where } from '../database';
import { BlockProgressInterface } from '../types';
import { cachePrunedEntitiesCount, eventProcessingLoadEntityCacheHitCount, eventProcessingLoadEntityCount, eventProcessingLoadEntityDBQueryDuration } from '../metrics';
import { ServerConfig } from '../config';
import { Block, fromEntityValue, getLatestEntityFromEntity, resolveEntityFieldConflicts, toEntityValue } from './utils';
import { fromStateEntityValues } from './state-utils';

const log = debug('vulcanize:graph-database');

export const DEFAULT_LIMIT = 100;
const DEFAULT_CLEAR_ENTITIES_CACHE_INTERVAL = 1000;

export enum ENTITY_QUERY_TYPE {
  SINGULAR,
  DISTINCT_ON,
  GROUP_BY,
  UNIQUE,
}

interface CachedEntities {
  frothyBlocks: Map<
    string,
    {
      blockNumber: number;
      parentHash: string;
      entities: Map<string, Map<string, { [key: string]: any }>>;
    }
  >;
  latestPrunedEntities: Map<string, Map<string, { [key: string]: any }>>;
}

export class GraphDatabase {
  _serverConfig: ServerConfig;
  _conn!: Connection;
  _baseDatabase: BaseDatabase;
  _entityQueryTypeMap: Map<new() => any, ENTITY_QUERY_TYPE>;
  _entityToLatestEntityMap: Map<new () => any, new () => any> = new Map();

  _cachedEntities: CachedEntities = {
    frothyBlocks: new Map(),
    latestPrunedEntities: new Map()
  };

  constructor (
    serverConfig: ServerConfig,
    baseDatabase: BaseDatabase,
    entityQueryTypeMap: Map<new () => any, ENTITY_QUERY_TYPE> = new Map(),
    entityToLatestEntityMap: Map<new () => any, new () => any> = new Map()
  ) {
    this._serverConfig = serverConfig;
    this._baseDatabase = baseDatabase;
    this._entityQueryTypeMap = entityQueryTypeMap;
    this._entityToLatestEntityMap = entityToLatestEntityMap;
  }

  get cachedEntities (): CachedEntities {
    return this._cachedEntities;
  }

  async init (): Promise<void> {
    this._conn = this._baseDatabase.conn;
    assert(this._conn);
  }

  async close (): Promise<void> {
    return this._baseDatabase.close();
  }

  async createTransactionRunner (): Promise<QueryRunner> {
    return this._baseDatabase.createTransactionRunner();
  }

  async getModelEntity<Entity extends ObjectLiteral> (repo: Repository<Entity>, whereOptions: any): Promise<Entity | undefined> {
    eventProcessingLoadEntityCount.inc();

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    if (findOptions.where.blockHash) {
      // Check cache only if latestPrunedEntities is updated.
      // latestPrunedEntities is updated when frothyBlocks is filled till canonical block height.
      if (this._cachedEntities.latestPrunedEntities.size > 0) {
        let frothyBlock = this._cachedEntities.frothyBlocks.get(findOptions.where.blockHash);
        let canonicalBlockNumber = -1;

        // Loop through frothy region until latest entity is found.
        while (frothyBlock) {
          const entity = frothyBlock.entities
            .get(repo.metadata.tableName)
            ?.get(findOptions.where.id);

          if (entity) {
            eventProcessingLoadEntityCacheHitCount.inc();
            return _.cloneDeep(entity) as Entity;
          }

          canonicalBlockNumber = frothyBlock.blockNumber + 1;
          frothyBlock = this._cachedEntities.frothyBlocks.get(frothyBlock.parentHash);
        }

        // Canonical block number is not assigned if blockHash does not exist in frothy region.
        // Get latest pruned entity from cache only if blockHash exists in frothy region.
        // i.e. Latest entity in cache is the version before frothy region.
        if (canonicalBlockNumber > -1) {
          // If entity not found in frothy region get latest entity in the pruned region.
          // Check if latest entity is cached in pruned region.
          const entity = this._cachedEntities.latestPrunedEntities
            .get(repo.metadata.tableName)
            ?.get(findOptions.where.id);

          if (entity) {
            eventProcessingLoadEntityCacheHitCount.inc();
            return _.cloneDeep(entity) as Entity;
          }

          // Get latest pruned entity from DB if not found in cache.
          const endTimer = eventProcessingLoadEntityDBQueryDuration.startTimer();
          const dbEntity = await this._baseDatabase.getLatestPrunedEntity(repo, findOptions.where.id, canonicalBlockNumber);
          endTimer();

          if (dbEntity) {
            // Update latest pruned entity in cache.
            this.cacheUpdatedEntity(repo, dbEntity, true);
          }

          return dbEntity;
        }
      }

      assert(repo.queryRunner);
      const endTimer = eventProcessingLoadEntityDBQueryDuration.startTimer();
      const dbEntity = await this._baseDatabase.getPrevEntityVersion(repo.queryRunner, repo, findOptions);
      endTimer();

      return dbEntity;
    }

    return repo.findOne(findOptions);
  }

  async getEntity<Entity extends ObjectLiteral> (entityName: string, id: string, blockHash?: string): Promise<Entity | undefined> {
    const queryRunner = this._conn.createQueryRunner();

    try {
      const repo: Repository<Entity> = queryRunner.manager.getRepository(entityName);

      const whereOptions: { [key: string]: any } = { id };

      if (blockHash) {
        whereOptions.blockHash = blockHash;
      }

      const entity = await this.getModelEntity(repo, whereOptions);
      return entity;
    } catch (error) {
      log(error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getEntityIdsAtBlockNumber (blockNumber: number, tableName: string): Promise<string[]> {
    const repo = this._conn.getRepository(tableName);

    const entities = await repo.find({
      select: ['id'],
      where: {
        blockNumber
      }
    });

    return entities.map((entity: any) => entity.id);
  }

  async isEntityUpdatedAtBlockNumber (blockNumber: number, tableName: string): Promise<boolean> {
    const repo = this._conn.getRepository(tableName);

    const count = await repo.count({
      where: {
        blockNumber
      }
    });

    return count > 0;
  }

  async getEntityWithRelations<Entity extends ObjectLiteral> (
    queryRunner: QueryRunner,
    entityType: (new () => Entity),
    id: string,
    relationsMap: Map<any, { [key: string]: any }>,
    block: BlockHeight = {},
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity | undefined> {
    let { hash: blockHash, number: blockNumber } = block;
    const repo = queryRunner.manager.getRepository(entityType);
    const whereOptions: any = { id };

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    if (blockHash) {
      whereOptions.blockHash = blockHash;
      const block = await this._baseDatabase.getBlockProgress(queryRunner.manager.getRepository('block_progress'), blockHash);
      blockNumber = block?.blockNumber;
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    let entityData: any = await repo.findOne(findOptions as FindOneOptions<Entity>);

    if (!entityData && findOptions.where.blockHash) {
      entityData = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    // Get relational fields
    if (entityData) {
      entityData = await this.loadEntityRelations(queryRunner, block, relationsMap, entityType, entityData, selections);
    }

    return entityData;
  }

  async loadEntityRelations<Entity> (
    queryRunner: QueryRunner,
    block: BlockHeight,
    relationsMap: Map<any, { [key: string]: any }>,
    entityType: new () => Entity, entityData: any,
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity> {
    const relations = relationsMap.get(entityType);
    if (relations === undefined) {
      return entityData;
    }

    const relationPromises = selections.filter((selection) => selection.kind === 'Field' && Boolean(relations[selection.name.value]))
      .map(async (selection) => {
        assert(selection.kind === 'Field');
        const field = selection.name.value;
        const { entity: relationEntity, isArray, isDerived, field: foreignKey } = relations[field];
        let childSelections = selection.selectionSet?.selections || [];

        // Filter out __typename field in GQL for loading relations.
        childSelections = childSelections.filter(selection => !(selection.kind === 'Field' && selection.name.value === '__typename'));

        if (isDerived) {
          const where: Where = {
            [foreignKey]: [{
              value: entityData.id,
              not: false,
              operator: 'equals'
            }]
          };

          const relatedEntities = await this.getEntities(
            queryRunner,
            relationEntity,
            relationsMap,
            block,
            where,
            { limit: DEFAULT_LIMIT },
            childSelections
          );

          entityData[field] = relatedEntities;

          return;
        }

        if (isArray) {
          const where: Where = {
            id: [{
              value: entityData[field],
              not: false,
              operator: 'in'
            }]
          };

          const relatedEntities = await this.getEntities(
            queryRunner,
            relationEntity,
            relationsMap,
            block,
            where,
            { limit: DEFAULT_LIMIT },
            childSelections
          );

          entityData[field] = relatedEntities;

          return;
        }

        // field is neither an array nor derivedFrom
        const relatedEntity = await this.getEntityWithRelations(
          queryRunner,
          relationEntity,
          entityData[field],
          relationsMap,
          block,
          childSelections
        );

        entityData[field] = relatedEntity;
      });

    await Promise.all(relationPromises);

    return entityData;
  }

  async getEntities<Entity extends ObjectLiteral> (
    queryRunner: QueryRunner,
    entityType: new () => Entity,
    relationsMap: Map<any, { [key: string]: any }>,
    block: BlockHeight = {},
    where: Where = {},
    queryOptions: QueryOptions = {},
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    let entities: Entity[] = [];
    const latestEntityType = this._entityToLatestEntityMap.get(entityType);

    if (latestEntityType) {
      if (Object.keys(block).length) {
        // Use lateral query for entities with latest entity table.
        entities = await this.getEntitiesLateral(
          queryRunner,
          entityType,
          latestEntityType,
          block,
          where,
          queryOptions
        );
      } else {
        // Use latest entity tables if block height not passed.
        entities = await this.getEntitiesLatest(
          queryRunner,
          entityType,
          latestEntityType,
          where,
          queryOptions,
          selections
        );
      }
    } else {
      // Use different suitable query patterns based on entities.
      switch (this._entityQueryTypeMap.get(entityType)) {
        case ENTITY_QUERY_TYPE.SINGULAR:
          entities = await this.getEntitiesSingular(queryRunner, entityType, block, where);
          break;

        case ENTITY_QUERY_TYPE.UNIQUE:
          entities = await this.getEntitiesUnique(queryRunner, entityType, block, where, queryOptions);
          break;

        case ENTITY_QUERY_TYPE.DISTINCT_ON:
          entities = await this.getEntitiesDistinctOn(queryRunner, entityType, block, where, queryOptions);
          break;

        case ENTITY_QUERY_TYPE.GROUP_BY:
        default:
          // Use group by query if entity query type is not specified in map.
          entities = await this.getEntitiesGroupBy(queryRunner, entityType, block, where, queryOptions);
          break;
      }
    }

    if (!entities.length) {
      return [];
    }

    entities = await this.loadEntitiesRelations(queryRunner, block, relationsMap, entityType, entities, selections);
    // Resolve any field name conflicts in the entity result.
    entities = entities.map(entity => resolveEntityFieldConflicts(entity));

    return entities;
  }

  async getEntitiesGroupBy<Entity extends ObjectLiteral> (
    queryRunner: QueryRunner,
    entityType: new () => Entity,
    block: BlockHeight,
    where: Where = {},
    queryOptions: QueryOptions = {}
  ): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entityType);
    const { tableName } = repo.metadata;

    let subQuery = repo.createQueryBuilder('subTable')
      .select('subTable.id', 'id')
      .addSelect('MAX(subTable.block_number)', 'block_number')
      .where('subTable.is_pruned = :isPruned', { isPruned: false })
      .groupBy('subTable.id');

    if (where.id) {
      subQuery = this._baseDatabase.buildQuery(repo, subQuery, { id: where.id });
      delete where.id;
    }

    if (block.hash) {
      const { canonicalBlockNumber, blockHashes } = await this._baseDatabase.getFrothyRegion(queryRunner, block.hash);

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
      .innerJoin(
        `(${subQuery.getQuery()})`,
        'latestEntities',
        `${tableName}.id = "latestEntities"."id" AND ${tableName}.block_number = "latestEntities"."block_number"`
      )
      .setParameters(subQuery.getParameters());

    selectQueryBuilder = this._baseDatabase.buildQuery(repo, selectQueryBuilder, where);

    if (queryOptions.orderBy) {
      selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, queryOptions);
    }

    selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, { ...queryOptions, orderBy: 'id' });

    if (queryOptions.skip) {
      selectQueryBuilder = selectQueryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      selectQueryBuilder = selectQueryBuilder.limit(queryOptions.limit);
    }

    const entities = await selectQueryBuilder.getMany();

    return entities;
  }

  async getEntitiesDistinctOn<Entity extends ObjectLiteral> (
    queryRunner: QueryRunner,
    entityType: new () => Entity,
    block: BlockHeight,
    where: Where = {},
    queryOptions: QueryOptions = {}
  ): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entityType);

    let subQuery = repo.createQueryBuilder('subTable')
      .distinctOn(['subTable.id'])
      .where('subTable.is_pruned = :isPruned', { isPruned: false })
      .addOrderBy('subTable.id', 'ASC')
      .addOrderBy('subTable.block_number', 'DESC');

    if (where.id) {
      subQuery = this._baseDatabase.buildQuery(repo, subQuery, { id: where.id });
      delete where.id;
    }

    if (block.hash) {
      const { canonicalBlockNumber, blockHashes } = await this._baseDatabase.getFrothyRegion(queryRunner, block.hash);

      subQuery = subQuery
        .andWhere(new Brackets(qb => {
          qb.where('subTable.block_hash IN (:...blockHashes)', { blockHashes })
            .orWhere('subTable.block_number <= :canonicalBlockNumber', { canonicalBlockNumber });
        }));
    }

    if (block.number) {
      subQuery = subQuery.andWhere('subTable.block_number <= :blockNumber', { blockNumber: block.number });
    }

    subQuery = this._baseDatabase.buildQuery(repo, subQuery, where);

    let selectQueryBuilder = queryRunner.manager.createQueryBuilder()
      .from(
        `(${subQuery.getQuery()})`,
        'latestEntities'
      )
      .setParameters(subQuery.getParameters()) as SelectQueryBuilder<Entity>;

    if (queryOptions.orderBy) {
      selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, queryOptions, 'subTable_');
      if (queryOptions.orderBy !== 'id') {
        selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, { ...queryOptions, orderBy: 'id' }, 'subTable_');
      }
    }

    if (queryOptions.skip) {
      selectQueryBuilder = selectQueryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      selectQueryBuilder = selectQueryBuilder.limit(queryOptions.limit);
    }

    let entities = await selectQueryBuilder.getRawMany();
    entities = await this.transformResults(queryRunner, repo.createQueryBuilder('subTable'), entities);

    return entities as Entity[];
  }

  async getEntitiesSingular<Entity extends ObjectLiteral> (
    queryRunner: QueryRunner,
    entityType: new () => Entity,
    block: BlockHeight,
    where: Where = {}
  ): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entityType);
    const { tableName } = repo.metadata;

    let selectQueryBuilder = repo.createQueryBuilder(tableName)
      .where('is_pruned = :isPruned', { isPruned: false })
      .addOrderBy(`${tableName}.block_number`, 'DESC')
      .limit(1);

    if (block.hash) {
      const { canonicalBlockNumber, blockHashes } = await this._baseDatabase.getFrothyRegion(queryRunner, block.hash);

      selectQueryBuilder = selectQueryBuilder
        .andWhere(new Brackets(qb => {
          qb.where(`${tableName}.block_hash IN (:...blockHashes)`, { blockHashes })
            .orWhere(`${tableName}.block_number <= :canonicalBlockNumber`, { canonicalBlockNumber });
        }));
    }

    if (block.number) {
      selectQueryBuilder = selectQueryBuilder.andWhere(`${tableName}.block_number <= :blockNumber`, { blockNumber: block.number });
    }

    selectQueryBuilder = this._baseDatabase.buildQuery(repo, selectQueryBuilder, where);

    const entities = await selectQueryBuilder.getMany();

    return entities as Entity[];
  }

  async getEntitiesUnique<Entity extends ObjectLiteral> (
    queryRunner: QueryRunner,
    entityType: new () => Entity,
    block: BlockHeight,
    where: Where = {},
    queryOptions: QueryOptions = {}
  ): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entityType);
    const { tableName } = repo.metadata;

    let selectQueryBuilder = repo.createQueryBuilder(tableName)
      .where('is_pruned = :isPruned', { isPruned: false });

    if (block.hash) {
      const { canonicalBlockNumber, blockHashes } = await this._baseDatabase.getFrothyRegion(queryRunner, block.hash);

      selectQueryBuilder = selectQueryBuilder
        .andWhere(new Brackets(qb => {
          qb.where(`${tableName}.block_hash IN (:...blockHashes)`, { blockHashes })
            .orWhere(`${tableName}.block_number <= :canonicalBlockNumber`, { canonicalBlockNumber });
        }));
    }

    if (block.number) {
      selectQueryBuilder = selectQueryBuilder.andWhere(`${tableName}.block_number <= :blockNumber`, { blockNumber: block.number });
    }

    selectQueryBuilder = this._baseDatabase.buildQuery(repo, selectQueryBuilder, where);

    if (queryOptions.orderBy) {
      selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, queryOptions);
    }

    selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, { ...queryOptions, orderBy: 'id' });

    if (queryOptions.skip) {
      selectQueryBuilder = selectQueryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      selectQueryBuilder = selectQueryBuilder.limit(queryOptions.limit);
    }

    const entities = await selectQueryBuilder.getMany();

    return entities as Entity[];
  }

  async getEntitiesLatest<Entity> (
    queryRunner: QueryRunner,
    entityType: new () => Entity,
    latestEntity: new () => any,
    where: Where = {},
    queryOptions: QueryOptions = {},
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    const entityRepo = queryRunner.manager.getRepository(entityType);
    const latestEntityRepo = queryRunner.manager.getRepository(latestEntity);
    const latestEntityFields = latestEntityRepo.metadata.columns.map(column => column.propertyName);

    const selectionNotInLatestEntity = selections.filter(selection => selection.kind === 'Field' && selection.name.value !== '__typename')
      .some(selection => {
        assert(selection.kind === 'Field');

        return !latestEntityFields.includes(selection.name.value);
      });

    // Use latest entity table for faster query.
    let repo = latestEntityRepo;
    let selectQueryBuilder = repo.createQueryBuilder('latest');

    if (selectionNotInLatestEntity) {
      // Join with latest entity table if selection field doesn't exist in latest entity.
      repo = entityRepo;

      selectQueryBuilder = repo.createQueryBuilder(repo.metadata.tableName)
        .innerJoin(
          latestEntity,
          'latest',
          `latest.id = ${repo.metadata.tableName}.id AND latest.blockHash = ${repo.metadata.tableName}.blockHash`
        );
    }

    selectQueryBuilder = this._baseDatabase.buildQuery(repo, selectQueryBuilder, where, 'latest');

    if (queryOptions.orderBy) {
      selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, queryOptions, '', 'latest');
    }

    selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, { ...queryOptions, orderBy: 'id' }, '', 'latest');

    if (queryOptions.skip) {
      selectQueryBuilder = selectQueryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      selectQueryBuilder = selectQueryBuilder.limit(queryOptions.limit);
    }

    return selectQueryBuilder.getMany();
  }

  async getEntitiesLateral<Entity extends ObjectLiteral> (
    queryRunner: QueryRunner,
    entityType: new () => Entity,
    latestEntity: new () => any,
    block: BlockHeight,
    where: Where = {},
    queryOptions: QueryOptions = {}
  ): Promise<Entity[]> {
    const entityRepo = queryRunner.manager.getRepository(entityType);
    const latestEntityRepo = queryRunner.manager.getRepository(latestEntity);

    let subQuery = entityRepo.createQueryBuilder('subTable')
      .where('latest.id = subTable.id')
      .andWhere('subTable.is_pruned = :isPruned', { isPruned: false })
      .orderBy('subTable.block_number', 'DESC')
      .limit(1);

    if (block.hash) {
      const { canonicalBlockNumber, blockHashes } = await this._baseDatabase.getFrothyRegion(queryRunner, block.hash);

      subQuery = subQuery
        .andWhere(new Brackets(qb => {
          qb.where('subTable.block_hash IN (:...blockHashes)', { blockHashes })
            .orWhere('subTable.block_number <= :canonicalBlockNumber', { canonicalBlockNumber });
        }));
    }

    if (block.number) {
      subQuery = subQuery.andWhere('subTable.block_number <= :blockNumber', { blockNumber: block.number });
    }

    let selectQueryBuilder = latestEntityRepo.createQueryBuilder('latest')
      .select('*')
      .from(
        qb => {
          // https://stackoverflow.com/a/72026555/10026807
          qb.getQuery = () => `LATERAL (${subQuery.getQuery()})`;
          qb.setParameters(subQuery.getParameters());
          return qb;
        },
        'result'
      ) as SelectQueryBuilder<Entity>;

    selectQueryBuilder = this._baseDatabase.buildQuery(latestEntityRepo, selectQueryBuilder, where, 'latest');

    if (queryOptions.orderBy) {
      selectQueryBuilder = this._baseDatabase.orderQuery(latestEntityRepo, selectQueryBuilder, queryOptions, '', 'latest');
    }

    selectQueryBuilder = this._baseDatabase.orderQuery(latestEntityRepo, selectQueryBuilder, { ...queryOptions, orderBy: 'id' }, '', 'latest');

    if (queryOptions.skip) {
      selectQueryBuilder = selectQueryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      selectQueryBuilder = selectQueryBuilder.limit(queryOptions.limit);
    }

    let entities = await selectQueryBuilder.getRawMany();
    entities = await this.transformResults(queryRunner, entityRepo.createQueryBuilder('subTable'), entities);

    return entities as Entity[];
  }

  async loadEntitiesRelations<Entity> (
    queryRunner: QueryRunner,
    block: BlockHeight,
    relationsMap: Map<any, { [key: string]: any }>,
    entity: new () => Entity,
    entities: Entity[],
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    const relations = relationsMap.get(entity);
    if (relations === undefined) {
      return entities;
    }

    const relationSelections = selections.filter((selection) => selection.kind === 'Field' && Boolean(relations[selection.name.value]));

    if (this._serverConfig.loadRelationsSequential) {
      for (const selection of relationSelections) {
        await this.loadRelation(queryRunner, block, relationsMap, relations, entities, selection);
      }
    } else {
      const loadRelationPromises = relationSelections.map(async selection => {
        await this.loadRelation(queryRunner, block, relationsMap, relations, entities, selection);
      });

      await Promise.all(loadRelationPromises);
    }

    return entities;
  }

  async loadRelation<Entity> (
    queryRunner: QueryRunner,
    block: BlockHeight,
    relationsMap: Map<any, { [key: string]: any }>,
    relations: { [key: string]: any },
    entities: Entity[],
    selection: SelectionNode
  ): Promise<void> {
    assert(selection.kind === 'Field');
    const field = selection.name.value;
    const { entity: relationEntity, isArray, isDerived, field: foreignKey } = relations[field];
    let childSelections = selection.selectionSet?.selections || [];

    // Filter out __typename field in GQL for loading relations.
    childSelections = childSelections.filter(selection => !(selection.kind === 'Field' && selection.name.value === '__typename'));

    if (isDerived) {
      const where: Where = {
        [foreignKey]: [{
          value: entities.map((entity: any) => entity.id),
          not: false,
          operator: 'in'
        }]
      };

      const relatedEntities = await this.getEntities(
        queryRunner,
        relationEntity,
        relationsMap,
        block,
        where,
        {},
        childSelections
      );

      const relatedEntitiesMap = relatedEntities.reduce((acc: {[key:string]: any[]}, entity: any) => {
        // Related entity might be loaded with data.
        const parentEntityId = entity[foreignKey].id ?? entity[foreignKey];

        if (!acc[parentEntityId]) {
          acc[parentEntityId] = [];
        }

        if (acc[parentEntityId].length < DEFAULT_LIMIT) {
          acc[parentEntityId].push(entity);
        }

        return acc;
      }, {});

      entities.forEach((entity: any) => {
        if (relatedEntitiesMap[entity.id]) {
          entity[field] = relatedEntitiesMap[entity.id];
        } else {
          entity[field] = [];
        }
      });

      return;
    }

    if (isArray) {
      const relatedIds = entities.reduce((acc: Set<string>, entity: any) => {
        entity[field].forEach((relatedEntityId: string) => acc.add(relatedEntityId));

        return acc;
      }, new Set());

      const where: Where = {
        id: [{
          value: Array.from(relatedIds),
          not: false,
          operator: 'in'
        }]
      };

      const relatedEntities = await this.getEntities(
        queryRunner,
        relationEntity,
        relationsMap,
        block,
        where,
        {},
        childSelections
      );

      entities.forEach((entity: any) => {
        const relatedEntityIds: Set<string> = entity[field].reduce((acc: Set<string>, id: string) => {
          acc.add(id);

          return acc;
        }, new Set());

        entity[field] = [];

        relatedEntities.forEach((relatedEntity: any) => {
          if (relatedEntityIds.has(relatedEntity.id) && entity[field].length < DEFAULT_LIMIT) {
            entity[field].push(relatedEntity);
          }
        });
      });

      return;
    }

    // field is neither an array nor derivedFrom

    // Avoid loading relation if selections only has id field.
    if (childSelections.length === 1 && childSelections[0].kind === 'Field' && childSelections[0].name.value === 'id') {
      entities.forEach((entity: any) => {
        entity[field] = { id: entity[field] };
      });

      return;
    }

    const where: Where = {
      id: [{
        value: entities.map((entity: any) => entity[field]),
        not: false,
        operator: 'in'
      }]
    };

    const relatedEntities = await this.getEntities(
      queryRunner,
      relationEntity,
      relationsMap,
      block,
      where,
      {},
      childSelections
    );

    const relatedEntitiesMap = relatedEntities.reduce((acc: {[key:string]: any}, entity: any) => {
      acc[entity.id] = entity;

      return acc;
    }, {});

    entities.forEach((entity: any) => {
      if (relatedEntitiesMap[entity[field]]) {
        entity[field] = relatedEntitiesMap[entity[field]];
      }
    });
  }

  async saveEntity (entityType: string, data: any): Promise<any> {
    const repo = this._conn.getRepository(entityType);

    const dbEntity: any = repo.create(data);
    return repo.save(dbEntity);
  }

  async toGraphEntity (instanceExports: any, entityName: string, data: any, entityTypes: { [key: string]: string }): Promise<any> {
    // TODO: Cache schema/columns.
    const repo = this._conn.getRepository(entityName);
    const entityFields = repo.metadata.columns;

    const { Entity } = instanceExports;
    const entityInstance = await Entity.__new();

    const entityValuePromises = entityFields.filter(field => {
      const { propertyName } = field;

      // Filter out blockHash and blockNumber from entity fields to fill the entityInstance (wasm).
      if (propertyName === 'blockHash' || propertyName === 'blockNumber') {
        return false;
      }

      return true;
    }).map(async (field) => {
      // Fill _blockNumber as blockNumber and _blockHash as blockHash in the entityInstance (wasm).
      if (['_blockNumber', '_blockHash'].includes(field.propertyName)) {
        field.propertyName = field.propertyName.slice(1);
      }

      const gqlType = entityTypes[field.propertyName];

      return toEntityValue(instanceExports, entityInstance, data, field, gqlType);
    }, {});

    await Promise.all(entityValuePromises);

    return entityInstance;
  }

  async fromGraphEntity (instanceExports: any, block: Block, entityName: string, entityInstance: any): Promise<{ [key: string]: any } > {
    // TODO: Cache schema/columns.
    const repo = this._conn.getRepository(entityName);
    const entityFields = repo.metadata.columns;

    return this.getEntityValues(instanceExports, block, entityInstance, entityFields);
  }

  async getEntityValues (instanceExports: any, block: Block, entityInstance: any, entityFields: any): Promise<{ [key: string]: any } > {
    const entityValuePromises = entityFields.map(async (field: any) => {
      const { propertyName } = field;

      if (propertyName === 'isPruned') {
        return undefined;
      }

      // Get blockHash property for db entry from block instance.
      if (propertyName === 'blockHash') {
        return block.blockHash;
      }

      // Get blockNumber property for db entry from block instance.
      if (propertyName === 'blockNumber') {
        return block.blockNumber;
      }

      // Get blockNumber as _blockNumber and blockHash as _blockHash from the entityInstance (wasm).
      if (['_blockNumber', '_blockHash'].includes(propertyName)) {
        return fromEntityValue(instanceExports, entityInstance, propertyName.slice(1));
      }

      return fromEntityValue(instanceExports, entityInstance, propertyName);
    }, {});

    const entityValues = await Promise.all(entityValuePromises);

    return entityFields.reduce((acc: { [key: string]: any }, field: any, index: number) => {
      const { propertyName } = field;
      acc[propertyName] = entityValues[index];

      return acc;
    }, {});
  }

  fromState (block: BlockProgressInterface, entityName: string, stateEntity: any, relations: { [key: string]: any } = {}): any {
    const repo = this._conn.getRepository(entityName);
    const entityFields = repo.metadata.columns;

    return this.getStateEntityValues(block, stateEntity, entityFields, relations);
  }

  getStateEntityValues (block: BlockProgressInterface, stateEntity: any, entityFields: ColumnMetadata[], relations: { [key: string]: any } = {}): { [key: string]: any } {
    const entityValues = entityFields.map((field) => {
      const { propertyName, transformer } = field;

      // Get blockHash property for db entry from block instance.
      if (propertyName === 'blockHash') {
        return block.blockHash;
      }

      // Get blockNumber property for db entry from block instance.
      if (propertyName === 'blockNumber') {
        return block.blockNumber;
      }

      // Get blockNumber as _blockNumber and blockHash as _blockHash from the entityInstance (wasm).
      if (['_blockNumber', '_blockHash'].includes(propertyName)) {
        return fromStateEntityValues(stateEntity, propertyName.slice(1), relations, transformer);
      }

      return fromStateEntityValues(stateEntity, propertyName, relations, transformer);
    }, {});

    return entityFields.reduce((acc: { [key: string]: any }, field: any, index: number) => {
      const { propertyName } = field;
      acc[propertyName] = entityValues[index];

      return acc;
    }, {});
  }

  cacheUpdatedEntityByName (entityName: string, entity: any, pruned = false): void {
    const repo = this._conn.getRepository<ObjectLiteral>(entityName);
    this.cacheUpdatedEntity(repo, entity, pruned);
  }

  cacheUpdatedEntity<Entity extends ObjectLiteral> (repo: Repository<Entity>, entity: any, pruned = false): void {
    const tableName = repo.metadata.tableName;

    if (pruned) {
      let entityIdMap = this._cachedEntities.latestPrunedEntities.get(tableName);

      if (!entityIdMap) {
        entityIdMap = new Map();
      }

      entityIdMap.set(entity.id, _.cloneDeep(entity));
      this._cachedEntities.latestPrunedEntities.set(tableName, entityIdMap);
      return;
    }

    const frothyBlock = this._cachedEntities.frothyBlocks.get(entity.blockHash);

    // Update frothyBlock only if already present in cache.
    // Might not be present when event processing starts without block processing on job retry.
    if (frothyBlock) {
      let entityIdMap = frothyBlock.entities.get(tableName);

      if (!entityIdMap) {
        entityIdMap = new Map();
      }

      entityIdMap.set(entity.id, _.cloneDeep(entity));
      frothyBlock.entities.set(tableName, entityIdMap);
    }
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]> {
    const repo: Repository<BlockProgressInterface> = this._conn.getRepository('block_progress');

    return this._baseDatabase.getBlocksAtHeight(repo, height, isPruned);
  }

  updateEntityCacheFrothyBlocks (blockProgress: BlockProgressInterface, clearEntitiesCacheInterval = DEFAULT_CLEAR_ENTITIES_CACHE_INTERVAL): void {
    // Set latest block in frothy region to cachedEntities.frothyBlocks map.
    if (!this.cachedEntities.frothyBlocks.has(blockProgress.blockHash)) {
      this.cachedEntities.frothyBlocks.set(
        blockProgress.blockHash,
        {
          blockNumber: blockProgress.blockNumber,
          parentHash: blockProgress.parentHash,
          entities: new Map()
        }
      );
    }

    log(`Size of cachedEntities.frothyBlocks map: ${this.cachedEntities.frothyBlocks.size}`);
    this._measureCachedPrunedEntities();

    // Check if it is time to clear entities cache.
    if (blockProgress.blockNumber % clearEntitiesCacheInterval === 0) {
      log(`Clearing cachedEntities.latestPrunedEntities at block ${blockProgress.blockNumber}`);
      // Clearing only pruned region as frothy region cache gets updated in pruning queue.
      this.cachedEntities.latestPrunedEntities.clear();
      log(`Cleared cachedEntities.latestPrunedEntities. Map size: ${this.cachedEntities.latestPrunedEntities.size}`);
    }
  }

  pruneEntityCacheFrothyBlocks (canonicalBlockHash: string, canonicalBlockNumber: number): void {
    const canonicalBlock = this.cachedEntities.frothyBlocks.get(canonicalBlockHash);

    if (canonicalBlock) {
      // Update latestPrunedEntities map with entities from latest canonical block.
      canonicalBlock.entities.forEach((entityIdMap, entityTableName) => {
        entityIdMap.forEach((data, id) => {
          let entityIdMap = this.cachedEntities.latestPrunedEntities.get(entityTableName);

          if (!entityIdMap) {
            entityIdMap = new Map();
          }

          entityIdMap.set(id, data);
          this.cachedEntities.latestPrunedEntities.set(entityTableName, entityIdMap);
        });
      });
    }

    // Remove pruned blocks from frothyBlocks.
    const prunedBlockHashes = Array.from(this.cachedEntities.frothyBlocks.entries())
      .filter(([, value]) => value.blockNumber <= canonicalBlockNumber)
      .map(([blockHash]) => blockHash);

    prunedBlockHashes.forEach(blockHash => this.cachedEntities.frothyBlocks.delete(blockHash));
  }

  async transformResults<Entity> (queryRunner: QueryRunner, qb: SelectQueryBuilder<Entity>, rawResults: any[]): Promise<any[]> {
    const transformer = new RawSqlResultsToEntityTransformer(
      qb.expressionMap,
      queryRunner.manager.connection.driver,
      [],
      [],
      queryRunner
    );
    assert(qb.expressionMap.mainAlias);
    return transformer.transform(rawResults, qb.expressionMap.mainAlias);
  }

  async updateEntity<Entity> (queryRunner: QueryRunner, entityType: new () => Entity, criteria: any, update: any): Promise<UpdateResult> {
    const repo = queryRunner.manager.getRepository(entityType);
    return repo.createQueryBuilder()
      .update()
      .set(update)
      .where(criteria)
      .execute();
  }

  async pruneEntities (frothyEntityType: new () => any, queryRunner: QueryRunner, blocks: BlockProgressInterface[], entityTypes: Set<new () => any>): Promise<void> {
    // Assumption: all blocks are at same height
    assert(blocks.length);
    const blockNumber = blocks[0].blockNumber;
    const blockHashes = blocks.map(block => block.blockHash);

    // Get all entities at the block height
    const entitiesAtHeight = await this._baseDatabase.getEntities(queryRunner, frothyEntityType, { where: { blockNumber } });

    // Extract entity ids from result
    const entityIdsMap: Map<string, string[]> = new Map();

    entitiesAtHeight.forEach(entity =>
      entityIdsMap.set(
        entity.name,
        [...entityIdsMap.get(entity.name) || [], entity.id]
      )
    );

    // Update isPruned flag using fetched entity ids and hashes of blocks to be pruned
    const updatePromises = [...entityTypes].map((entityType) => {
      return this.updateEntity(
        queryRunner,
        entityType as any,
        { id: In(entityIdsMap.get(entityType.name) || []), blockHash: In(blockHashes) },
        { isPruned: true }
      );
    });

    // Simultaneously update isPruned flag for all entities
    await Promise.all(updatePromises);

    // Update latest entity tables with canonical entries
    await this.updateNonCanonicalLatestEntities(queryRunner, blockNumber, blockHashes);
  }

  async updateNonCanonicalLatestEntities (queryRunner: QueryRunner, blockNumber: number, nonCanonicalBlockHashes: string[]): Promise<void> {
    // Update latest entity tables with canonical entries
    await Promise.all(
      Array.from(this._entityToLatestEntityMap.entries()).map(async ([entityType, latestEntityType]) => {
        // Get entries for non canonical blocks
        const nonCanonicalLatestEntities = await this._baseDatabase.getEntities(queryRunner, latestEntityType, { where: { blockHash: In(nonCanonicalBlockHashes) } });

        // Canonicalize latest entity table at given block height
        await this.canonicalizeLatestEntity(queryRunner, entityType, latestEntityType, nonCanonicalLatestEntities, blockNumber);
      })
    );
  }

  async canonicalizeLatestEntity (queryRunner: QueryRunner, entityType: any, latestEntityType: any, entities: any[], blockNumber: number): Promise<void> {
    const repo = queryRunner.manager.getRepository<ObjectLiteral>(entityType);
    const latestEntityRepo = queryRunner.manager.getRepository<ObjectLiteral>(latestEntityType);

    await Promise.all(entities.map(async (entity: any) => {
      // Get latest pruned (canonical) version for the given entity
      const prunedVersion = await this._baseDatabase.getLatestPrunedEntity(repo, entity.id, blockNumber);

      // If found, update the latestEntity entry for the id
      // Else, delete the latestEntity entry for the id
      if (prunedVersion) {
        // Create a latest entity instance and insert in the db
        const latestEntity = getLatestEntityFromEntity(latestEntityRepo, prunedVersion);

        await this.updateEntity(
          queryRunner,
          latestEntityType,
          { id: entity.id },
          latestEntity
        );
      } else {
        await this._baseDatabase.removeEntities(
          queryRunner,
          latestEntityType,
          { where: { id: entity.id } }
        );
      }
    }));
  }

  async pruneFrothyEntities<Entity> (queryRunner: QueryRunner, frothyEntityType: new () => Entity, blockNumber: number): Promise<void> {
    // Remove frothy entity entries at | below the prune block height
    return this._baseDatabase.removeEntities(queryRunner, frothyEntityType, { where: { blockNumber: LessThanOrEqual(blockNumber) } });
  }

  async resetLatestEntities (queryRunner: QueryRunner, blockNumber: number): Promise<void> {
    await Promise.all(
      Array.from(this._entityToLatestEntityMap.entries()).map(async ([entityType, latestEntityType]) => {
        // Get entries above the reset block
        const entitiesToReset = await this._baseDatabase.getEntities(queryRunner, latestEntityType, { where: { blockNumber: MoreThan(blockNumber) } });

        // Canonicalize latest entity table at the reset block height
        await this.canonicalizeLatestEntity(queryRunner, entityType, latestEntityType, entitiesToReset, blockNumber);
      })
    );
  }

  _measureCachedPrunedEntities (): void {
    const totalEntities = Array.from(this.cachedEntities.latestPrunedEntities.values())
      .reduce((acc, idEntitiesMap) => acc + idEntitiesMap.size, 0);

    log(`Total entities in cachedEntities.latestPrunedEntities map: ${totalEntities}`);
    cachePrunedEntitiesCount.set(totalEntities);
  }
}
