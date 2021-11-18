//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { Connection, ConnectionOptions, DeepPartial, FindConditions, QueryRunner, FindManyOptions, MoreThan } from 'typeorm';
import path from 'path';

import { Database as BaseDatabase, MAX_REORG_DEPTH, DatabaseInterface } from '@vulcanize/util';

import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { HookStatus } from './entity/HookStatus';
import { BlockProgress } from './entity/BlockProgress';
import { IPLDBlock } from './entity/IPLDBlock';

import { GetMethod } from './entity/GetMethod';
import { _Test } from './entity/_Test';

export class Database implements DatabaseInterface {
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

  async getIPLDBlocks (where: FindConditions<IPLDBlock>): Promise<IPLDBlock[]> {
    const repo = this._conn.getRepository(IPLDBlock);
    return repo.find({ where, relations: ['block'] });
  }

  async getLatestIPLDBlock (contractAddress: string, kind: string | null, blockNumber?: number): Promise<IPLDBlock | undefined> {
    const repo = this._conn.getRepository(IPLDBlock);

    let queryBuilder = repo.createQueryBuilder('ipld_block')
      .leftJoinAndSelect('ipld_block.block', 'block')
      .where('block.is_pruned = false')
      .andWhere('ipld_block.contract_address = :contractAddress', { contractAddress })
      .orderBy('block.block_number', 'DESC');

    // Filter out blocks after the provided block number.
    if (blockNumber) {
      queryBuilder.andWhere('block.block_number <= :blockNumber', { blockNumber });
    }

    // Filter using kind if specified else order by id to give preference to checkpoint.
    queryBuilder = kind
      ? queryBuilder.andWhere('ipld_block.kind = :kind', { kind })
      : queryBuilder.andWhere('ipld_block.kind != :kind', { kind: 'diff_staged' })
        .addOrderBy('ipld_block.id', 'DESC');

    return queryBuilder.getOne();
  }

  async getPrevIPLDBlock (queryRunner: QueryRunner, blockHash: string, contractAddress: string, kind?: string): Promise<IPLDBlock | undefined> {
    const heirerchicalQuery = `
      WITH RECURSIVE cte_query AS
      (
        SELECT
          b.block_hash,
          b.block_number,
          b.parent_hash,
          1 as depth,
          i.id,
          i.kind
        FROM
          block_progress b
          LEFT JOIN
            ipld_block i ON i.block_id = b.id
            AND i.contract_address = $2
        WHERE
          b.block_hash = $1
        UNION ALL
          SELECT
            b.block_hash,
            b.block_number,
            b.parent_hash,
            c.depth + 1,
            i.id,
            i.kind
          FROM
            block_progress b
            LEFT JOIN
              ipld_block i
              ON i.block_id = b.id
              AND i.contract_address = $2
            INNER JOIN
              cte_query c ON c.parent_hash = b.block_hash
            WHERE
              c.depth < $3
      )
      SELECT
        block_number, id, kind
      FROM
        cte_query
      ORDER BY block_number DESC, id DESC
    `;

    // Fetching block and id for previous IPLDBlock in frothy region.
    const queryResult = await queryRunner.query(heirerchicalQuery, [blockHash, contractAddress, MAX_REORG_DEPTH]);
    const latestRequiredResult = kind
      ? queryResult.find((obj: any) => obj.kind === kind)
      : queryResult.find((obj: any) => obj.id);

    let result: IPLDBlock | undefined;
    if (latestRequiredResult) {
      result = await queryRunner.manager.findOne(IPLDBlock, { id: latestRequiredResult.id }, { relations: ['block'] });
    } else {
      // If IPLDBlock not found in frothy region get latest IPLDBlock in the pruned region.
      // Filter out IPLDBlocks from pruned blocks.
      const canonicalBlockNumber = queryResult.pop().block_number + 1;

      let queryBuilder = queryRunner.manager.createQueryBuilder(IPLDBlock, 'ipld_block')
        .leftJoinAndSelect('ipld_block.block', 'block')
        .where('block.is_pruned = false')
        .andWhere('ipld_block.contract_address = :contractAddress', { contractAddress })
        .andWhere('block.block_number <= :canonicalBlockNumber', { canonicalBlockNumber })
        .orderBy('block.block_number', 'DESC');

      // Filter using kind if specified else order by id to give preference to checkpoint.
      queryBuilder = kind
        ? queryBuilder.andWhere('ipld_block.kind = :kind', { kind })
        : queryBuilder.addOrderBy('ipld_block.id', 'DESC');

      result = await queryBuilder.getOne();
    }

    return result;
  }

  // Fetch all diff IPLDBlocks after the specified checkpoint.
  async getDiffIPLDBlocksByCheckpoint (contractAddress: string, checkpointBlockNumber: number): Promise<IPLDBlock[]> {
    const repo = this._conn.getRepository(IPLDBlock);

    return repo.find({
      relations: ['block'],
      where: {
        contractAddress,
        kind: 'diff',
        block: {
          isPruned: false,
          blockNumber: MoreThan(checkpointBlockNumber)
        }
      },
      order: {
        block: 'ASC'
      }
    });
  }

  async saveOrUpdateIPLDBlock (ipldBlock: IPLDBlock): Promise<IPLDBlock> {
    const repo = this._conn.getRepository(IPLDBlock);
    return repo.save(ipldBlock);
  }

  async getHookStatus (queryRunner: QueryRunner): Promise<HookStatus | undefined> {
    const repo = queryRunner.manager.getRepository(HookStatus);

    return repo.findOne();
  }

  async updateHookStatusProcessedBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<HookStatus> {
    const repo = queryRunner.manager.getRepository(HookStatus);
    let entity = await repo.findOne();

    if (!entity) {
      entity = repo.create({
        latestProcessedBlockNumber: blockNumber
      });
    }

    if (force || blockNumber > entity.latestProcessedBlockNumber) {
      entity.latestProcessedBlockNumber = blockNumber;
    }

    return repo.save(entity);
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

  async getBlockEvents (blockHash: string, options: FindManyOptions<Event>): Promise<Event[]> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getBlockEvents(repo, blockHash, options);
  }

  async saveEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgress>, events: DeepPartial<Event>[]): Promise<void> {
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
