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

  async getEntity<Entity> (entity: (new () => Entity) | string, id: string, blockHash: string): Promise<Entity | undefined> {
    const queryRunner = this._conn.createQueryRunner();
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
        field.propertyName = field.propertyName.slice(1)

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
      const { type, propertyName } = field;

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
        return fromEntityValue(instanceExports, entityInstance, type.toString());
      }

      return fromEntityValue(instanceExports, entityInstance, type.toString());
    }, {});

    const entityValues = await Promise.all(entityValuePromises);

    return entityFields.reduce((acc: { [key: string]: any }, field: any, index: number) => {
      const { propertyName } = field;
      acc[propertyName] = entityValues[index];

      return acc;
    }, {});
  }
}
