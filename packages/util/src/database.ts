//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { Connection, ConnectionOptions, createConnection, FindConditions, QueryRunner, Repository } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { BlockProgressInterface, SyncStatusInterface } from './types';

export class Database {
  _config: ConnectionOptions
  _conn!: Connection

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
  }

  async init (): Promise<Connection> {
    assert(!this._conn);

    this._conn = await createConnection({
      ...this._config,
      namingStrategy: new SnakeNamingStrategy()
    });

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

  async updateSyncStatusIndexedBlock (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    const entity = await repo.findOne();
    assert(entity);

    if (blockNumber >= entity.latestIndexedBlockNumber) {
      entity.latestIndexedBlockHash = blockHash;
      entity.latestIndexedBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async updateSyncStatusCanonicalBlock (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    const entity = await repo.findOne();
    assert(entity);

    if (blockNumber >= entity.latestCanonicalBlockNumber) {
      entity.latestCanonicalBlockHash = blockHash;
      entity.latestCanonicalBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async updateSyncStatusChainHead (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    let entity = await repo.findOne();
    if (!entity) {
      entity = repo.create({
        chainHeadBlockHash: blockHash,
        chainHeadBlockNumber: blockNumber,
        latestCanonicalBlockHash: blockHash,
        latestCanonicalBlockNumber: blockNumber,
        latestIndexedBlockHash: '',
        latestIndexedBlockNumber: -1
      });
    }

    if (blockNumber >= entity.chainHeadBlockNumber) {
      entity.chainHeadBlockHash = blockHash;
      entity.chainHeadBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async getBlocksAtHeight (repo: Repository<BlockProgressInterface>, height: number, isPruned: boolean): Promise<BlockProgressInterface[]> {
    return repo.createQueryBuilder('block_progress')
      .where('block_number = :height AND is_pruned = :isPruned', { height, isPruned })
      .getMany();
  }

  async markBlockAsPruned (repo: Repository<BlockProgressInterface>, block: BlockProgressInterface): Promise<BlockProgressInterface> {
    block.isPruned = true;
    return repo.save(block);
  }

  async getEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entity);

    const entities = await repo.find(findConditions);
    return entities;
  }

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<void> {
    const repo = queryRunner.manager.getRepository(entity);

    const entities = await repo.find(findConditions);
    await repo.remove(entities);
  }

  async isEntityEmpty<Entity> (entity: new () => Entity): Promise<boolean> {
    const dbTx = await this.createTransactionRunner();
    try {
      const data = await this.getEntities(dbTx, entity);

      if (data.length > 0) {
        return false;
      }
      return true;
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }
}
