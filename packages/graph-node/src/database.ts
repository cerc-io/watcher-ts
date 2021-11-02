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

import { Block, getEntityData } from './utils';

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

    if (block.hash) {
      whereOptions.blockHash = block.hash;
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

  async saveEntity (exports: any, block: Block, entity: string, instance: any): Promise<void> {
    const repo = this._conn.getRepository(entity);
    const data = await getEntityData(exports, repo, block, instance);
    const dbEntity: any = await repo.create(data);
    await repo.save(dbEntity);
  }
}
