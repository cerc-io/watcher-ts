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
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import { SelectionNode } from 'graphql';
import _ from 'lodash';
import debug from 'debug';

import {
  BlockHeight,
  BlockProgressInterface,
  cachePrunedEntitiesCount,
  Database as BaseDatabase,
  eventProcessingLoadEntityCacheHitCount,
  eventProcessingLoadEntityCount,
  eventProcessingLoadEntityDBQueryDuration,
  QueryOptions,
  Where
} from '@cerc-io/util';

import { Block, fromEntityValue, fromStateEntityValues, toEntityValue } from './utils';

const log = debug('vulcanize:graph-database');

export const DEFAULT_LIMIT = 100;
const DEFAULT_CLEAR_ENTITIES_CACHE_INTERVAL = 1000;

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

export class Database {
  _config: ConnectionOptions
  _conn!: Connection
  _baseDatabase: BaseDatabase

  _cachedEntities: CachedEntities = {
    frothyBlocks: new Map(),
    latestPrunedEntities: new Map()
  }

  constructor (config: ConnectionOptions, entitiesPath: string) {
    assert(config);

    this._config = {
      name: 'subgraph',
      ...config,
      entities: [entitiesPath]
    };

    this._baseDatabase = new BaseDatabase(this._config);
  }

  get cachedEntities () {
    return this._cachedEntities;
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

  async getModelEntity<Entity> (repo: Repository<Entity>, whereOptions: any): Promise<Entity | undefined> {
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

      const endTimer = eventProcessingLoadEntityDBQueryDuration.startTimer();
      const dbEntity = await this._baseDatabase.getPrevEntityVersion(repo.queryRunner!, repo, findOptions);
      endTimer();

      return dbEntity;
    }

    return repo.findOne(findOptions);
  }

  async getEntity<Entity> (entityName: string, id: string, blockHash?: string): Promise<Entity | undefined> {
    const queryRunner = this._conn.createQueryRunner();

    try {
      const repo: Repository<Entity> = queryRunner.manager.getRepository(entityName);

      const whereOptions: { [key: string]: any } = { id };

      if (blockHash) {
        whereOptions.blockHash = blockHash;
      }

      return this.getModelEntity(repo, whereOptions);
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

  async isEntityUpdatedAtBlockNumber (blockNumber: number, tableName: string): Promise<boolean> {
    const repo = this._conn.getRepository(tableName);

    const count = await repo.count({
      where: {
        blockNumber
      }
    });

    return count > 0;
  }

  async getEntityWithRelations<Entity> (
    queryRunner: QueryRunner,
    entity: (new () => Entity),
    id: string,
    relationsMap: Map<any, { [key: string]: any }>,
    block: BlockHeight = {},
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity | undefined> {
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
      entityData = await this.loadEntityRelations(queryRunner, block, relationsMap, entity, entityData, selections);
    }

    return entityData;
  }

  async loadEntityRelations<Entity> (
    queryRunner: QueryRunner,
    block: BlockHeight,
    relationsMap: Map<any, { [key: string]: any }>,
    entity: new () => Entity, entityData: any,
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity> {
    const relations = relationsMap.get(entity);
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

  async getEntities<Entity> (
    queryRunner: QueryRunner,
    entity: new () => Entity,
    relationsMap: Map<any, { [key: string]: any }>,
    block: BlockHeight,
    where: Where = {},
    queryOptions: QueryOptions = {},
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
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

    return this.loadEntitiesRelations(queryRunner, block, relationsMap, entity, entities, selections);
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

    const relationPromises = selections.filter((selection) => selection.kind === 'Field' && Boolean(relations[selection.name.value]))
      .map(async selection => {
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
        if (childSelections.length === 1 && childSelections[0].kind === 'Field' && childSelections[0].name.value === 'id') {
          // Avoid loading relation if selections only has id field.
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
      });

    await Promise.all(relationPromises);

    return entities;
  }

  async saveEntity (entity: string, data: any): Promise<any> {
    const repo = this._conn.getRepository(entity);

    const dbEntity: any = repo.create(data);
    return repo.save(dbEntity);
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

  fromState (block: BlockProgressInterface, entity: string, stateEntity: any, relations: { [key: string]: any } = {}): any {
    const repo = this._conn.getRepository(entity);
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
    const repo = this._conn.getRepository(entityName);
    this.cacheUpdatedEntity(repo, entity, pruned);
  }

  cacheUpdatedEntity<Entity> (repo: Repository<Entity>, entity: any, pruned = false): void {
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

  async getBlocksAtHeight (height: number, isPruned: boolean) {
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

  pruneEntityCacheFrothyBlocks (canonicalBlockHash: string, canonicalBlockNumber: number) {
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

  _measureCachedPrunedEntities () {
    const totalEntities = Array.from(this.cachedEntities.latestPrunedEntities.values())
      .reduce((acc, idEntitiesMap) => acc + idEntitiesMap.size, 0);

    log(`Total entities in cachedEntities.latestPrunedEntities map: ${totalEntities}`);
    cachePrunedEntitiesCount.set(totalEntities);
  }
}
