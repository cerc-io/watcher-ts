//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { Connection, ConnectionOptions, DeepPartial, FindConditions, QueryRunner, FindManyOptions } from 'typeorm';
import path from 'path';

import { IPLDDatabase as BaseDatabase, IPLDDatabaseInterface, QueryOptions, Where } from '@vulcanize/util';

import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { HookStatus } from './entity/HookStatus';
import { BlockProgress } from './entity/BlockProgress';
import { IPLDBlock } from './entity/IPLDBlock';

import { GetMethod } from './entity/GetMethod';
import { _Test } from './entity/_Test';

export class Database implements IPLDDatabaseInterface {
  _config: ConnectionOptions;
  _conn!: Connection;
  _baseDatabase: BaseDatabase;
  _propColMaps: { [key: string]: Map<string, string>; }

  constructor (config: ConnectionOptions) {
    assert(config);

    this._config = {
      ...config,
      entities: [path.join(__dirname, 'entity/*')]
    };

    this._baseDatabase = new BaseDatabase(this._config);
    this._propColMaps = {};
  }

  async init (): Promise<void> {
    this._conn = await this._baseDatabase.init();
    this._setPropColMaps();
  }

  async close (): Promise<void> {
    return this._baseDatabase.close();
  }

  async getGetMethod ({ blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<GetMethod | undefined> {
    return this._conn.getRepository(GetMethod)
      .findOne({
        blockHash,
        contractAddress
      });
  }

  async _getTest ({ blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<_Test | undefined> {
    return this._conn.getRepository(_Test)
      .findOne({
        blockHash,
        contractAddress
      });
  }

  async saveGetMethod ({ blockHash, blockNumber, contractAddress, value, proof }: DeepPartial<GetMethod>): Promise<GetMethod> {
    const repo = this._conn.getRepository(GetMethod);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, value, proof });
    return repo.save(entity);
  }

  async _saveTest ({ blockHash, blockNumber, contractAddress, value, proof }: DeepPartial<_Test>): Promise<_Test> {
    const repo = this._conn.getRepository(_Test);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, value, proof });
    return repo.save(entity);
  }

  getNewIPLDBlock (): IPLDBlock {
    return new IPLDBlock();
  }

  async getIPLDBlocks (where: FindConditions<IPLDBlock>): Promise<IPLDBlock[]> {
    const repo = this._conn.getRepository(IPLDBlock);

    return this._baseDatabase.getIPLDBlocks(repo, where);
  }

  async getLatestIPLDBlock (contractAddress: string, kind: string | null, blockNumber?: number): Promise<IPLDBlock | undefined> {
    const repo = this._conn.getRepository(IPLDBlock);

    return this._baseDatabase.getLatestIPLDBlock(repo, contractAddress, kind, blockNumber);
  }

  async getPrevIPLDBlock (blockHash: string, contractAddress: string, kind?: string): Promise<IPLDBlock | undefined> {
    const repo = this._conn.getRepository(IPLDBlock);

    return this._baseDatabase.getPrevIPLDBlock(repo, blockHash, contractAddress, kind);
  }

  // Fetch all diff IPLDBlocks after the specified block number.
  async getDiffIPLDBlocksByBlocknumber (contractAddress: string, blockNumber: number): Promise<IPLDBlock[]> {
    const repo = this._conn.getRepository(IPLDBlock);

    return this._baseDatabase.getDiffIPLDBlocksByBlocknumber(repo, contractAddress, blockNumber);
  }

  async saveOrUpdateIPLDBlock (dbTx: QueryRunner, ipldBlock: IPLDBlock): Promise<IPLDBlock> {
    const repo = dbTx.manager.getRepository(IPLDBlock);

    return this._baseDatabase.saveOrUpdateIPLDBlock(repo, ipldBlock);
  }

  async removeIPLDBlocks (dbTx: QueryRunner, blockNumber: number, kind: string): Promise<void> {
    await this._baseDatabase.removeEntities(dbTx, IPLDBlock, { relations: ['block'], where: { block: { blockNumber }, kind } });
  }

  async getHookStatus (): Promise<HookStatus | undefined> {
    const repo = this._conn.getRepository(HookStatus);

    return this._baseDatabase.getHookStatus(repo);
  }

  async updateHookStatusProcessedBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<HookStatus> {
    const repo = queryRunner.manager.getRepository(HookStatus);

    return this._baseDatabase.updateHookStatusProcessedBlock(repo, blockNumber, force);
  }

  async getContracts (): Promise<Contract[]> {
    const repo = this._conn.getRepository(Contract);

    return this._baseDatabase.getContracts(repo);
  }

  async createTransactionRunner (): Promise<QueryRunner> {
    return this._baseDatabase.createTransactionRunner();
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getProcessedBlockCountForRange(repo, fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getEventsInRange(repo, fromBlockNumber, toBlockNumber);
  }

  async saveEventEntity (queryRunner: QueryRunner, entity: Event): Promise<Event> {
    const repo = queryRunner.manager.getRepository(Event);
    return this._baseDatabase.saveEventEntity(repo, entity);
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Event[]> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getBlockEvents(repo, blockHash, where, queryOptions);
  }

  async saveEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgress>, events: DeepPartial<Event>[]): Promise<BlockProgress> {
    const blockRepo = queryRunner.manager.getRepository(BlockProgress);
    const eventRepo = queryRunner.manager.getRepository(Event);

    return this._baseDatabase.saveEvents(blockRepo, eventRepo, block, events);
  }

  async saveContract (queryRunner: QueryRunner, address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<Contract> {
    const repo = queryRunner.manager.getRepository(Contract);

    return this._baseDatabase.saveContract(repo, address, kind, checkpoint, startingBlock);
  }

  async updateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusIndexedBlock(repo, blockHash, blockNumber, force);
  }

  async updateSyncStatusCanonicalBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusCanonicalBlock(repo, blockHash, blockNumber, force);
  }

  async updateSyncStatusChainHead (queryRunner: QueryRunner, blockHash: string, blockNumber: number): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusChainHead(repo, blockHash, blockNumber);
  }

  async getSyncStatus (queryRunner: QueryRunner): Promise<SyncStatus | undefined> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.getSyncStatus(repo);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getEvent(repo, id);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getBlocksAtHeight(repo, height, isPruned);
  }

  async markBlocksAsPruned (queryRunner: QueryRunner, blocks: BlockProgress[]): Promise<void> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.markBlocksAsPruned(repo, blocks);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    const repo = this._conn.getRepository(BlockProgress);
    return this._baseDatabase.getBlockProgress(repo, blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgress>, options: FindManyOptions<BlockProgress>): Promise<BlockProgress[]> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getBlockProgressEntities(repo, where, options);
  }

  async updateBlockProgress (queryRunner: QueryRunner, block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.updateBlockProgress(repo, block, lastProcessedEventIndex);
  }

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindManyOptions<Entity> | FindConditions<Entity>): Promise<void> {
    return this._baseDatabase.removeEntities(queryRunner, entity, findConditions);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseDatabase.getAncestorAtDepth(blockHash, depth);
  }

  _getPropertyColumnMapForEntity (entityName: string): Map<string, string> {
    return this._conn.getMetadata(entityName).ownColumns.reduce((acc, curr) => {
      return acc.set(curr.propertyName, curr.databaseName);
    }, new Map<string, string>());
  }

  _setPropColMaps (): void {
    this._propColMaps.GetMethod = this._getPropertyColumnMapForEntity('GetMethod');
    this._propColMaps._Test = this._getPropertyColumnMapForEntity('_Test');
  }
}
