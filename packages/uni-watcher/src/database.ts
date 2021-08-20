//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import _ from 'lodash';
import { Connection, ConnectionOptions, DeepPartial, QueryRunner, FindConditions } from 'typeorm';

import { Database as BaseDatabase, DatabaseInterface } from '@vulcanize/util';

import { Event, UNKNOWN_EVENT_NAME } from './entity/Event';
import { Contract } from './entity/Contract';
import { BlockProgress } from './entity/BlockProgress';
import { SyncStatus } from './entity/SyncStatus';

export class Database implements DatabaseInterface {
  _config: ConnectionOptions
  _conn!: Connection
  _baseDatabase: BaseDatabase

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
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

  async getBlockEvents (blockHash: string): Promise<Event[]> {
    return this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_hash = :blockHash', { blockHash })
      .addOrderBy('event.id', 'ASC')
      .getMany();
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    const blockNumbers = _.range(fromBlockNumber, toBlockNumber + 1);
    const expected = blockNumbers.length;

    const repo = this._conn.getRepository(BlockProgress);
    const { count: actual } = await repo
      .createQueryBuilder('block_progress')
      .select('COUNT(DISTINCT(block_number))', 'count')
      .where('block_number IN (:...blockNumbers) AND is_complete = :isComplete', { blockNumbers, isComplete: true })
      .getRawOne();

    return { expected, actual: parseInt(actual) };
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    const events = await this._conn.getRepository(Event)
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_number >= :fromBlockNumber AND block_number <= :toBlockNumber AND event_name <> :eventName', {
        fromBlockNumber,
        toBlockNumber,
        eventName: UNKNOWN_EVENT_NAME
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();

    return events;
  }

  async saveEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgress>, events: DeepPartial<Event>[]): Promise<void> {
    const {
      blockHash,
      blockNumber,
      blockTimestamp,
      parentHash
    } = block;

    assert(blockHash);
    assert(blockNumber);
    assert(blockTimestamp);
    assert(parentHash);

    // In a transaction:
    // (1) Save all the events in the database.
    // (2) Add an entry to the block progress table.
    const numEvents = events.length;
    const blockProgressRepo = queryRunner.manager.getRepository(BlockProgress);
    let blockProgress = await blockProgressRepo.findOne({ where: { blockHash } });
    if (!blockProgress) {
      const entity = blockProgressRepo.create({
        blockHash,
        parentHash,
        blockNumber,
        blockTimestamp,
        numEvents,
        numProcessedEvents: 0,
        lastProcessedEventIndex: -1,
        isComplete: (numEvents === 0)
      });

      blockProgress = await blockProgressRepo.save(entity);

      // Bulk insert events.
      events.forEach(event => {
        event.block = blockProgress;
      });

      await queryRunner.manager.createQueryBuilder().insert().into(Event).values(events).execute();
    }
  }

  async updateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusIndexedBlock(repo, blockHash, blockNumber);
  }

  async updateSyncStatusCanonicalBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusCanonicalBlock(repo, blockHash, blockNumber);
  }

  async updateSyncStatusChainHead (queryRunner: QueryRunner, blockHash: string, blockNumber: number): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusChainHead(repo, blockHash, blockNumber);
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    const repo = this._conn.getRepository(SyncStatus);
    return repo.findOne();
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._conn.getRepository(Event).findOne(id, { relations: ['block'] });
  }

  async saveEventEntity (queryRunner: QueryRunner, entity: Event): Promise<Event> {
    const repo = queryRunner.manager.getRepository(Event);
    return await repo.save(entity);
  }

  async getContract (address: string): Promise<Contract | undefined> {
    return this._conn.getRepository(Contract)
      .createQueryBuilder('contract')
      .where('address = :address', { address })
      .getOne();
  }

  async getLatestContract (kind: string): Promise<Contract | undefined> {
    return this._conn.getRepository(Contract)
      .createQueryBuilder('contract')
      .where('kind = :kind', { kind })
      .orderBy('id', 'DESC')
      .getOne();
  }

  async saveContract (queryRunner: QueryRunner, address: string, kind: string, startingBlock: number): Promise<void> {
    const repo = queryRunner.manager.getRepository(Contract);

    const numRows = await repo
      .createQueryBuilder()
      .where('address = :address', { address })
      .getCount();

    if (numRows === 0) {
      const entity = repo.create({ address, kind, startingBlock });
      await repo.save(entity);
    }
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getBlocksAtHeight(repo, height, isPruned);
  }

  async markBlockAsPruned (queryRunner: QueryRunner, block: BlockProgress): Promise<BlockProgress> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.markBlockAsPruned(repo, block);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    const repo = this._conn.getRepository(BlockProgress);
    return repo.findOne({ where: { blockHash } });
  }

  async updateBlockProgress (queryRunner: QueryRunner, blockHash: string, lastProcessedEventIndex: number): Promise<void> {
    const repo = queryRunner.manager.getRepository(BlockProgress);
    const entity = await repo.findOne({ where: { blockHash } });
    if (entity && !entity.isComplete) {
      if (lastProcessedEventIndex <= entity.lastProcessedEventIndex) {
        throw new Error(`Events processed out of order ${blockHash}, was ${entity.lastProcessedEventIndex}, got ${lastProcessedEventIndex}`);
      }

      entity.lastProcessedEventIndex = lastProcessedEventIndex;
      entity.numProcessedEvents++;
      if (entity.numProcessedEvents >= entity.numEvents) {
        entity.isComplete = true;
      }

      await repo.save(entity);
    }
  }

  async getEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<Entity[]> {
    return this._baseDatabase.getEntities(queryRunner, entity, findConditions);
  }

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<void> {
    return this._baseDatabase.removeEntities(queryRunner, entity, findConditions);
  }

  async isEntityEmpty<Entity> (entity: new () => Entity): Promise<boolean> {
    return this._baseDatabase.isEntityEmpty(entity);
  }
}
