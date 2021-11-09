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

  async getEntity (block: Block, entity: string, id: string): Promise<any> {
    const queryRunner = this._conn.createQueryRunner();
    const repo = queryRunner.manager.getRepository(entity);
    const whereOptions: { [key: string]: any } = { id };

    if (block.blockHash) {
      whereOptions.blockHash = block.blockHash;
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
    const dbEntity: any = await repo.create(data);
    await repo.save(dbEntity);
  }

  async toGraphEntity (instanceExports: any, entity: string, data: any): Promise<any> {
    const repo = this._conn.getRepository(entity);
    const entityFields = repo.metadata.columns;

    const { Entity } = instanceExports;
    const entityInstance = await Entity.__new();

    const entityValuePromises = entityFields.filter(field => {
      const { propertyName } = field;

      if (propertyName === 'blockHash' || propertyName === 'blockNumber') {
        return false;
      }

      return true;
    }).map(async (field) => {
      const { type, propertyName } = field;

      return toEntityValue(instanceExports, entityInstance, data, type.toString(), propertyName);
    }, {});

    await Promise.all(entityValuePromises);

    return entityInstance;
  }

  async fromGraphEntity (instanceExports: any, block: Block, entity: string, entityInstance: any): Promise<{ [key: string]: any } > {
    const repo = this._conn.getRepository(entity);
    const entityFields = repo.metadata.columns;

    const entityValuePromises = entityFields.map(async (field) => {
      const { type, propertyName } = field;

      if (propertyName === 'blockHash') {
        return block.blockHash;
      }

      if (propertyName === 'blockNumber') {
        return block.blockNumber;
      }

      return fromEntityValue(instanceExports, entityInstance, type.toString(), propertyName);
    }, {});

    const entityValues = await Promise.all(entityValuePromises);

    return entityFields.reduce((acc: { [key: string]: any }, field, index) => {
      const { propertyName } = field;
      acc[propertyName] = entityValues[index];

      return acc;
    }, {});
  }
}
