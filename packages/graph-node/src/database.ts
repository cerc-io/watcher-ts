//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import {
  Connection,
  ConnectionOptions
} from 'typeorm';

import {
  Database as BaseDatabase
} from '@vulcanize/util';

import { getEntityData } from './utils';

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

  async getEntity (entity: string, id: string): Promise<any> {
    return this._conn.getRepository(entity)
      .findOne(id);
  }

  async saveEntity (exports: any, entity: string, instance: any): Promise<void> {
    const repo = this._conn.getRepository(entity);
    const data = await getEntityData(exports, repo, instance);
    const dbEntity: any = await repo.create(data);
    await repo.save(dbEntity);
  }
}
