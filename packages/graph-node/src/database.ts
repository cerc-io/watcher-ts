//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import {
  Connection,
  ConnectionOptions,
  FindOneOptions
} from 'typeorm';

import {
  Database as BaseDatabase
} from '@vulcanize/util';

import { Block, fromEntityValue, toEntityValue } from './utils';

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
    // TODO: Take block number as an optional argument
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

  async getEntityWithRelations<Entity> (entity: (new () => Entity) | string, id: string, relations: { [key: string]: any }, blockHash?: string): Promise<Entity | undefined> {
    const queryRunner = this._conn.createQueryRunner();

    try {
      const repo = queryRunner.manager.getRepository(entity);

      let selectQueryBuilder = repo.createQueryBuilder('entity');

      selectQueryBuilder = selectQueryBuilder.where('entity.id = :id', { id })
        .orderBy('entity.block_number', 'DESC');

      // Use blockHash if provided.
      if (blockHash) {
        // Fetching blockHash for previous entity in frothy region.
        const { blockHash: entityblockHash, blockNumber, id: frothyId } = await this._baseDatabase.getFrothyEntity(queryRunner, repo, { blockHash, id });

        if (frothyId) {
          // If entity found in frothy region.
          selectQueryBuilder = selectQueryBuilder.andWhere('entity.block_hash = :entityblockHash', { entityblockHash });
        } else {
          // If entity not in frothy region.
          const canonicalBlockNumber = blockNumber + 1;

          selectQueryBuilder = selectQueryBuilder.innerJoinAndSelect('block_progress', 'block', 'block.block_hash = entity.block_hash')
            .andWhere('block.is_pruned = false')
            .andWhere('entity.block_number <= :canonicalBlockNumber', { canonicalBlockNumber });
        }
      }

      // TODO: Implement query for nested relations.
      Object.entries(relations).forEach(([field, data], index) => {
        const { entity: relatedEntity, isArray, isDerived, field: derivedField } = data;
        const alias = `relatedEntity${index}`;
        let condition: string;

        if (isDerived) {
          // For derived relational field.
          condition = `${alias}.${derivedField} = entity.id AND ${alias}.block_number <= entity.block_number`;
        } else {
          if (isArray) {
            // For one to many relational field.
            condition = `${alias}.id IN (SELECT unnest(entity.${field})) AND ${alias}.block_number <= entity.block_number`;
          } else {
            // For one to one relational field.
            condition = `entity.${field} = ${alias}.id AND ${alias}.block_number <= entity.block_number`;
          }
        }

        if (isArray) {
          selectQueryBuilder = selectQueryBuilder.leftJoinAndMapMany(
            `entity.${field}`,
            relatedEntity,
            alias,
            condition
          ).addOrderBy(`${alias}.block_number`, 'DESC');
        } else {
          selectQueryBuilder = selectQueryBuilder.leftJoinAndMapOne(
            `entity.${field}`,
            relatedEntity,
            alias,
            condition
          ).addOrderBy(`${alias}.block_number`, 'DESC');
        }
      });

      return selectQueryBuilder.getOne();
    } finally {
      await queryRunner.release();
    }
  }

  async saveEntity (entity: string, data: any): Promise<void> {
    const repo = this._conn.getRepository(entity);

    const dbEntity: any = repo.create(data);
    await repo.save(dbEntity);
  }

  async toGraphEntity (instanceExports: any, entity: string, data: any): Promise<any> {
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

        return toEntityValue(instanceExports, entityInstance, data, field);
      }

      return toEntityValue(instanceExports, entityInstance, data, field);
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
