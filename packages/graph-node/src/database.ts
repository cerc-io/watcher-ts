//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import {
  Connection,
  ConnectionOptions,
  FindOneOptions,
  LessThanOrEqual
} from 'typeorm';

import {
  BlockHeight,
  Database as BaseDatabase
} from '@vulcanize/util';

import { Block, fromEntityValue, toEntityValue } from './utils';

const DEFAULT_LIMIT = 100;

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

  async getEntityWithRelations<Entity> (entity: (new () => Entity) | string, id: string, relations: { [key: string]: any }, block: BlockHeight = {}): Promise<Entity | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let { hash: blockHash, number: blockNumber } = block;

    try {
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

      if (entityData) {
        // Populate relational fields.
        // TODO: Implement query for nested relations.
        const relationQueryPromises = Object.entries(relations).map(async ([field, data]) => {
          assert(entityData);
          const { entity: relatedEntity, isArray, isDerived, field: derivedField } = data;

          const repo = queryRunner.manager.getRepository(relatedEntity);
          let selectQueryBuilder = repo.createQueryBuilder('entity');

          if (isDerived) {
            // For derived relational field.
            selectQueryBuilder = selectQueryBuilder.where(`entity.${derivedField} = :id`, { id: entityData.id });

            if (isArray) {
              selectQueryBuilder = selectQueryBuilder.distinctOn(['entity.id'])
                .orderBy('entity.id')
                .limit(DEFAULT_LIMIT);
            } else {
              selectQueryBuilder = selectQueryBuilder.limit(1);
            }
          } else {
            if (isArray) {
              // For one to many relational field.
              selectQueryBuilder = selectQueryBuilder.where('entity.id IN (:...ids)', { ids: entityData[field] })
                .distinctOn(['entity.id'])
                .orderBy('entity.id')
                .limit(DEFAULT_LIMIT);

              // Subquery example if distinctOn is not performant.
              //
              // SELECT c.*
              // FROM
              //   categories c,
              //   (
              //     SELECT id, MAX(block_number) as block_number
              //     FROM categories
              //     WHERE
              //       id IN ('nature', 'tech', 'issues')
              //       AND
              //       block_number <= 127
              //     GROUP BY id
              //   ) a
              // WHERE
              //   c.id = a.id AND c.block_number = a.block_number
            } else {
              // For one to one relational field.
              selectQueryBuilder = selectQueryBuilder.where('entity.id = :id', { id: entityData[field] })
                .limit(1);
            }

            selectQueryBuilder = selectQueryBuilder.addOrderBy('entity.block_number', 'DESC');
          }

          if (blockNumber) {
            selectQueryBuilder = selectQueryBuilder.andWhere(
              'entity.block_number <= :blockNumber',
              { blockNumber }
            );
          }

          if (isArray) {
            entityData[field] = await selectQueryBuilder.getMany();
          } else {
            entityData[field] = await selectQueryBuilder.getOne();
          }
        });

        await Promise.all(relationQueryPromises);
      }

      return entityData;
    } finally {
      await queryRunner.release();
    }
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
}
