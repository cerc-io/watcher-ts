//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import {
  Brackets,
  Connection,
  ConnectionOptions,
  FindOneOptions,
  LessThanOrEqual,
  QueryRunner,
  Repository
} from 'typeorm';

import {
  BlockHeight,
  BlockProgressInterface,
  Database as BaseDatabase,
  QueryOptions,
  Where
} from '@cerc-io/util';

import { Block, fromEntityValue, toEntityValue } from './utils';

export const DEFAULT_LIMIT = 100;

export class Database {
  _config: ConnectionOptions
  _conn!: Connection
  _baseDatabase: BaseDatabase

  constructor (config: ConnectionOptions, entitiesPath: string) {
    assert(config);

    this._config = {
      name: 'subgraph',
      ...config,
      entities: [entitiesPath]
    };

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

  async getEntity<Entity> (entity: (new () => Entity) | string, id: string, blockHash?: string): Promise<Entity | undefined> {
    const queryRunner = this._conn.createQueryRunner();

    try {
      const repo = queryRunner.manager.getRepository(entity);

      const whereOptions: { [key: string]: any } = { id };

      if (blockHash) {
        whereOptions.blockHash = blockHash;
      }

      const findOptions = {
        where: whereOptions,
        order: {
          blockNumber: 'DESC'
        }
      };

      let entityData = await repo.findOne(findOptions as FindOneOptions<any>);

      if (!entityData && findOptions.where.blockHash) {
        entityData = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
      }

      return entityData;
    } catch (error) {
      console.log(error);
    } finally {
      await queryRunner.release();
    }
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

  async getEntityWithRelations<Entity> (queryRunner: QueryRunner, entity: (new () => Entity), id: string, relationsMap: Map<any, { [key: string]: any }>, block: BlockHeight = {}, depth = 1): Promise<Entity | undefined> {
    let { hash: blockHash, number: blockNumber } = block;
    const repo = queryRunner.manager.getRepository(entity);
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
      entityData = await this.loadEntityRelations(queryRunner, block, relationsMap, entity, entityData, depth);
    }

    return entityData;
  }

  async loadEntityRelations<Entity> (queryRunner: QueryRunner, block: BlockHeight, relationsMap: Map<any, { [key: string]: any }>, entity: new () => Entity, entityData: any, depth: number): Promise<Entity> {
    // Only support two-level nesting of relations
    if (depth > 2) {
      return entityData;
    }

    const relations = relationsMap.get(entity);
    if (relations === undefined) {
      return entityData;
    }

    const relationPromises = Object.entries(relations)
      .map(async ([field, data]) => {
        const { entity: relationEntity, isArray, isDerived, field: foreignKey } = data;

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
            depth + 1
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
            depth + 1
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
          depth + 1
        );

        entityData[field] = relatedEntity;
      });

    await Promise.all(relationPromises);

    return entityData;
  }

  async getEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, relationsMap: Map<any, { [key: string]: any }>, block: BlockHeight, where: Where = {}, queryOptions: QueryOptions = {}, depth = 1): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entity);
    const { tableName } = repo.metadata;

    let subQuery = repo.createQueryBuilder('subTable')
      .select('subTable.id', 'id')
      .addSelect('MAX(subTable.block_number)', 'block_number')
      .addFrom('block_progress', 'blockProgress')
      .where('subTable.block_hash = blockProgress.block_hash')
      .andWhere('blockProgress.is_pruned = :isPruned', { isPruned: false })
      .groupBy('subTable.id');

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

    if (!entities.length) {
      return [];
    }

    return this.loadEntitiesRelations(queryRunner, block, relationsMap, entity, entities, depth);
  }

  async loadEntitiesRelations<Entity> (queryRunner: QueryRunner, block: BlockHeight, relationsMap: Map<any, { [key: string]: any }>, entity: new () => Entity, entities: Entity[], depth: number): Promise<Entity[]> {
    // Only support two-level nesting of relations
    if (depth > 2) {
      return entities;
    }

    const relations = relationsMap.get(entity);
    if (relations === undefined) {
      return entities;
    }

    const relationPromises = Object.entries(relations).map(async ([field, data]) => {
      const { entity: relationEntity, isArray, isDerived, field: foreignKey } = data;

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
          depth + 1
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
          depth + 1
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
        depth + 1
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
    });

    await Promise.all(relationPromises);

    return entities;
  }

  async saveEntity (entity: string, data: any): Promise<void> {
    const repo = this._conn.getRepository(entity);

    const dbEntity: any = repo.create(data);
    await repo.save(dbEntity);
  }

  async toGraphEntity (instanceExports: any, entity: string, data: any, entityTypes: { [key: string]: string }): Promise<any> {
    // TODO: Cache schema/columns.
    const repo = this._conn.getRepository(entity);
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

  async fromGraphEntity (instanceExports: any, block: Block, entity: string, entityInstance: any): Promise<{ [key: string]: any } > {
    // TODO: Cache schema/columns.
    const repo = this._conn.getRepository(entity);
    const entityFields = repo.metadata.columns;

    return this.getEntityValues(instanceExports, block, entityInstance, entityFields);
  }

  async getEntityValues (instanceExports: any, block: Block, entityInstance: any, entityFields: any): Promise<{ [key: string]: any } > {
    const entityValuePromises = entityFields.map(async (field: any) => {
      const { propertyName } = field;

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

  async getBlocksAtHeight (height: number, isPruned: boolean) {
    const repo: Repository<BlockProgressInterface> = this._conn.getRepository('block_progress');

    return this._baseDatabase.getBlocksAtHeight(repo, height, isPruned);
  }
}
