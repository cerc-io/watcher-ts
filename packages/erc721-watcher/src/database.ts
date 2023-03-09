//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { Connection, ConnectionOptions, DeepPartial, FindConditions, QueryRunner, FindManyOptions, FindOneOptions, LessThanOrEqual, EntityTarget, UpdateResult } from 'typeorm';
import path from 'path';

import { Database as BaseDatabase, DatabaseInterface, QueryOptions, StateKind, Where } from '@cerc-io/util';

import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { StateSyncStatus } from './entity/StateSyncStatus';
import { BlockProgress } from './entity/BlockProgress';
import { State } from './entity/State';
import { SupportsInterface } from './entity/SupportsInterface';
import { BalanceOf } from './entity/BalanceOf';
import { OwnerOf } from './entity/OwnerOf';
import { GetApproved } from './entity/GetApproved';
import { IsApprovedForAll } from './entity/IsApprovedForAll';
import { Name } from './entity/Name';
import { Symbol } from './entity/Symbol';
import { TokenURI } from './entity/TokenURI';
import { _Name } from './entity/_Name';
import { _Symbol } from './entity/_Symbol';
import { _Owners } from './entity/_Owners';
import { _Balances } from './entity/_Balances';
import { _TokenApprovals } from './entity/_TokenApprovals';
import { _OperatorApprovals } from './entity/_OperatorApprovals';
import { TransferCount } from './entity/TransferCount';

export const ENTITIES = [_Balances, _Name, _OperatorApprovals, _Owners, _Symbol, _TokenApprovals, BalanceOf, GetApproved, IsApprovedForAll, Name, OwnerOf, SupportsInterface, Symbol, TokenURI, TransferCount];

export class Database implements DatabaseInterface {
  _config: ConnectionOptions;
  _conn!: Connection;
  _baseDatabase: BaseDatabase;
  _propColMaps: { [key: string]: Map<string, string>; };

  constructor (config: ConnectionOptions) {
    assert(config);

    this._config = {
      ...config,
      entities: [path.join(__dirname, 'entity/*')]
    };

    this._baseDatabase = new BaseDatabase(this._config);
    this._propColMaps = {};
  }

  get baseDatabase (): BaseDatabase {
    return this._baseDatabase;
  }

  async init (): Promise<void> {
    this._conn = await this._baseDatabase.init();
    this._setPropColMaps();
  }

  async close (): Promise<void> {
    return this._baseDatabase.close();
  }

  async getSupportsInterface ({ blockHash, contractAddress, interfaceId }: { blockHash: string, contractAddress: string, interfaceId: string }): Promise<SupportsInterface | undefined> {
    return this._conn.getRepository(SupportsInterface)
      .findOne({
        blockHash,
        contractAddress,
        interfaceId
      });
  }

  async getBalanceOf ({ blockHash, contractAddress, owner }: { blockHash: string, contractAddress: string, owner: string }): Promise<BalanceOf | undefined> {
    return this._conn.getRepository(BalanceOf)
      .findOne({
        blockHash,
        contractAddress,
        owner
      });
  }

  async getOwnerOf ({ blockHash, contractAddress, tokenId }: { blockHash: string, contractAddress: string, tokenId: bigint }): Promise<OwnerOf | undefined> {
    return this._conn.getRepository(OwnerOf)
      .findOne({
        blockHash,
        contractAddress,
        tokenId
      });
  }

  async getGetApproved ({ blockHash, contractAddress, tokenId }: { blockHash: string, contractAddress: string, tokenId: bigint }): Promise<GetApproved | undefined> {
    return this._conn.getRepository(GetApproved)
      .findOne({
        blockHash,
        contractAddress,
        tokenId
      });
  }

  async getIsApprovedForAll ({ blockHash, contractAddress, owner, operator }: { blockHash: string, contractAddress: string, owner: string, operator: string }): Promise<IsApprovedForAll | undefined> {
    return this._conn.getRepository(IsApprovedForAll)
      .findOne({
        blockHash,
        contractAddress,
        owner,
        operator
      });
  }

  async getName ({ blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<Name | undefined> {
    return this._conn.getRepository(Name)
      .findOne({
        blockHash,
        contractAddress
      });
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  async getSymbol ({ blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<Symbol | undefined> {
    return this._conn.getRepository(Symbol)
      .findOne({
        blockHash,
        contractAddress
      });
  }

  async getTokenURI ({ blockHash, contractAddress, tokenId }: { blockHash: string, contractAddress: string, tokenId: bigint }): Promise<TokenURI | undefined> {
    return this._conn.getRepository(TokenURI)
      .findOne({
        blockHash,
        contractAddress,
        tokenId
      });
  }

  async getTransferCount (queryRunner: QueryRunner, { id, blockHash, blockNumber }: DeepPartial<TransferCount>): Promise<TransferCount | undefined> {
    const repo = queryRunner.manager.getRepository(TransferCount);
    const whereOptions: FindConditions<TransferCount> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    let entity = await repo.findOne(findOptions as FindOneOptions<TransferCount>);

    if (!entity && findOptions.where.blockHash) {
      entity = await this._baseDatabase.getPrevEntityVersion(queryRunner, repo, findOptions);
    }

    return entity;
  }

  async saveTransferCount (queryRunner: QueryRunner, transferCount: TransferCount): Promise<TransferCount> {
    const repo = queryRunner.manager.getRepository(TransferCount);
    return repo.save(transferCount);
  }

  async _getName ({ blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<_Name | undefined> {
    return this._conn.getRepository(_Name)
      .findOne({
        blockHash,
        contractAddress
      });
  }

  async _getSymbol ({ blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<_Symbol | undefined> {
    return this._conn.getRepository(_Symbol)
      .findOne({
        blockHash,
        contractAddress
      });
  }

  async _getOwners ({ blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: bigint }): Promise<_Owners | undefined> {
    return this._conn.getRepository(_Owners)
      .findOne({
        blockHash,
        contractAddress,
        key0
      });
  }

  async _getBalances ({ blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: string }): Promise<_Balances | undefined> {
    return this._conn.getRepository(_Balances)
      .findOne({
        blockHash,
        contractAddress,
        key0
      });
  }

  async _getTokenApprovals ({ blockHash, contractAddress, key0 }: { blockHash: string, contractAddress: string, key0: bigint }): Promise<_TokenApprovals | undefined> {
    return this._conn.getRepository(_TokenApprovals)
      .findOne({
        blockHash,
        contractAddress,
        key0
      });
  }

  async _getOperatorApprovals ({ blockHash, contractAddress, key0, key1 }: { blockHash: string, contractAddress: string, key0: string, key1: string }): Promise<_OperatorApprovals | undefined> {
    return this._conn.getRepository(_OperatorApprovals)
      .findOne({
        blockHash,
        contractAddress,
        key0,
        key1
      });
  }

  async saveSupportsInterface ({ blockHash, blockNumber, contractAddress, interfaceId, value, proof }: DeepPartial<SupportsInterface>): Promise<SupportsInterface> {
    const repo = this._conn.getRepository(SupportsInterface);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, interfaceId, value, proof });
    return repo.save(entity);
  }

  async saveBalanceOf ({ blockHash, blockNumber, contractAddress, owner, value, proof }: DeepPartial<BalanceOf>): Promise<BalanceOf> {
    const repo = this._conn.getRepository(BalanceOf);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, owner, value, proof });
    return repo.save(entity);
  }

  async saveOwnerOf ({ blockHash, blockNumber, contractAddress, tokenId, value, proof }: DeepPartial<OwnerOf>): Promise<OwnerOf> {
    const repo = this._conn.getRepository(OwnerOf);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, tokenId, value, proof });
    return repo.save(entity);
  }

  async saveGetApproved ({ blockHash, blockNumber, contractAddress, tokenId, value, proof }: DeepPartial<GetApproved>): Promise<GetApproved> {
    const repo = this._conn.getRepository(GetApproved);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, tokenId, value, proof });
    return repo.save(entity);
  }

  async saveIsApprovedForAll ({ blockHash, blockNumber, contractAddress, owner, operator, value, proof }: DeepPartial<IsApprovedForAll>): Promise<IsApprovedForAll> {
    const repo = this._conn.getRepository(IsApprovedForAll);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, owner, operator, value, proof });
    return repo.save(entity);
  }

  async saveName ({ blockHash, blockNumber, contractAddress, value, proof }: DeepPartial<Name>): Promise<Name> {
    const repo = this._conn.getRepository(Name);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, value, proof });
    return repo.save(entity);
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  async saveSymbol ({ blockHash, blockNumber, contractAddress, value, proof }: DeepPartial<Symbol>): Promise<Symbol> {
    const repo = this._conn.getRepository(Symbol);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, value, proof });
    return repo.save(entity);
  }

  async saveTokenURI ({ blockHash, blockNumber, contractAddress, tokenId, value, proof }: DeepPartial<TokenURI>): Promise<TokenURI> {
    const repo = this._conn.getRepository(TokenURI);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, tokenId, value, proof });
    return repo.save(entity);
  }

  async _saveName ({ blockHash, blockNumber, contractAddress, value, proof }: DeepPartial<_Name>): Promise<_Name> {
    const repo = this._conn.getRepository(_Name);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, value, proof });
    return repo.save(entity);
  }

  async _saveSymbol ({ blockHash, blockNumber, contractAddress, value, proof }: DeepPartial<_Symbol>): Promise<_Symbol> {
    const repo = this._conn.getRepository(_Symbol);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, value, proof });
    return repo.save(entity);
  }

  async _saveOwners ({ blockHash, blockNumber, contractAddress, key0, value, proof }: DeepPartial<_Owners>): Promise<_Owners> {
    const repo = this._conn.getRepository(_Owners);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, key0, value, proof });
    return repo.save(entity);
  }

  async _saveBalances ({ blockHash, blockNumber, contractAddress, key0, value, proof }: DeepPartial<_Balances>): Promise<_Balances> {
    const repo = this._conn.getRepository(_Balances);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, key0, value, proof });
    return repo.save(entity);
  }

  async _saveTokenApprovals ({ blockHash, blockNumber, contractAddress, key0, value, proof }: DeepPartial<_TokenApprovals>): Promise<_TokenApprovals> {
    const repo = this._conn.getRepository(_TokenApprovals);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, key0, value, proof });
    return repo.save(entity);
  }

  async _saveOperatorApprovals ({ blockHash, blockNumber, contractAddress, key0, key1, value, proof }: DeepPartial<_OperatorApprovals>): Promise<_OperatorApprovals> {
    const repo = this._conn.getRepository(_OperatorApprovals);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, key0, key1, value, proof });
    return repo.save(entity);
  }

  getNewState (): State {
    return new State();
  }

  async getStates (where: FindConditions<State>): Promise<State[]> {
    const repo = this._conn.getRepository(State);

    return this._baseDatabase.getStates(repo, where);
  }

  async getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<State | undefined> {
    const repo = this._conn.getRepository(State);

    return this._baseDatabase.getLatestState(repo, contractAddress, kind, blockNumber);
  }

  async getPrevState (blockHash: string, contractAddress: string, kind?: string): Promise<State | undefined> {
    const repo = this._conn.getRepository(State);

    return this._baseDatabase.getPrevState(repo, blockHash, contractAddress, kind);
  }

  // Fetch all diff States after the specified block number.
  async getDiffStatesInRange (contractAddress: string, startblock: number, endBlock: number): Promise<State[]> {
    const repo = this._conn.getRepository(State);

    return this._baseDatabase.getDiffStatesInRange(repo, contractAddress, startblock, endBlock);
  }

  async saveOrUpdateState (dbTx: QueryRunner, state: State): Promise<State> {
    const repo = dbTx.manager.getRepository(State);

    return this._baseDatabase.saveOrUpdateState(repo, state);
  }

  async removeStates (dbTx: QueryRunner, blockNumber: number, kind: string): Promise<void> {
    const repo = dbTx.manager.getRepository(State);

    await this._baseDatabase.removeStates(repo, blockNumber, kind);
  }

  async removeStatesAfterBlock (dbTx: QueryRunner, blockNumber: number): Promise<void> {
    const repo = dbTx.manager.getRepository(State);

    await this._baseDatabase.removeStatesAfterBlock(repo, blockNumber);
  }

  async getStateSyncStatus (): Promise<StateSyncStatus | undefined> {
    const repo = this._conn.getRepository(StateSyncStatus);

    return this._baseDatabase.getStateSyncStatus(repo);
  }

  async updateStateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    const repo = queryRunner.manager.getRepository(StateSyncStatus);

    return this._baseDatabase.updateStateSyncStatusIndexedBlock(repo, blockNumber, force);
  }

  async updateStateSyncStatusCheckpointBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    const repo = queryRunner.manager.getRepository(StateSyncStatus);

    return this._baseDatabase.updateStateSyncStatusCheckpointBlock(repo, blockNumber, force);
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

  async saveBlockWithEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgress>, events: DeepPartial<Event>[]): Promise<BlockProgress> {
    const blockRepo = queryRunner.manager.getRepository(BlockProgress);
    const eventRepo = queryRunner.manager.getRepository(Event);

    return this._baseDatabase.saveBlockWithEvents(blockRepo, eventRepo, block, events);
  }

  async saveEvents (queryRunner: QueryRunner, events: Event[]): Promise<void> {
    const eventRepo = queryRunner.manager.getRepository(Event);

    return this._baseDatabase.saveEvents(eventRepo, events);
  }

  async saveBlockProgress (queryRunner: QueryRunner, block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.saveBlockProgress(repo, block);
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

  async updateSyncStatusChainHead (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusChainHead(repo, blockHash, blockNumber, force);
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

  async getEntitiesForBlock (blockHash: string, tableName: string): Promise<any[]> {
    return this._baseDatabase.getEntitiesForBlock(blockHash, tableName);
  }

  async updateBlockProgress (queryRunner: QueryRunner, block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.updateBlockProgress(repo, block, lastProcessedEventIndex);
  }

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindManyOptions<Entity> | FindConditions<Entity>): Promise<void> {
    return this._baseDatabase.removeEntities(queryRunner, entity, findConditions);
  }

  async deleteEntitiesByConditions<Entity> (queryRunner: QueryRunner, entity: EntityTarget<Entity>, findConditions: FindConditions<Entity>): Promise<void> {
    await this._baseDatabase.deleteEntitiesByConditions(queryRunner, entity, findConditions);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseDatabase.getAncestorAtDepth(blockHash, depth);
  }

  async updateEntity<Entity> (queryRunner: QueryRunner, entityType: new () => Entity, criteria: any, update: any): Promise<UpdateResult> {
    const repo = queryRunner.manager.getRepository(entityType);
    return repo.createQueryBuilder()
      .update()
      .set(update)
      .where(criteria)
      .execute();
  }

  _getPropertyColumnMapForEntity (entityName: string): Map<string, string> {
    return this._conn.getMetadata(entityName).ownColumns.reduce((acc, curr) => {
      return acc.set(curr.propertyName, curr.databaseName);
    }, new Map<string, string>());
  }

  _setPropColMaps (): void {
    this._propColMaps.SupportsInterface = this._getPropertyColumnMapForEntity('SupportsInterface');
    this._propColMaps.BalanceOf = this._getPropertyColumnMapForEntity('BalanceOf');
    this._propColMaps.OwnerOf = this._getPropertyColumnMapForEntity('OwnerOf');
    this._propColMaps.GetApproved = this._getPropertyColumnMapForEntity('GetApproved');
    this._propColMaps.IsApprovedForAll = this._getPropertyColumnMapForEntity('IsApprovedForAll');
    this._propColMaps.Name = this._getPropertyColumnMapForEntity('Name');
    this._propColMaps.Symbol = this._getPropertyColumnMapForEntity('Symbol');
    this._propColMaps.TokenURI = this._getPropertyColumnMapForEntity('TokenURI');
    this._propColMaps._Name = this._getPropertyColumnMapForEntity('_Name');
    this._propColMaps._Symbol = this._getPropertyColumnMapForEntity('_Symbol');
    this._propColMaps._Owners = this._getPropertyColumnMapForEntity('_Owners');
    this._propColMaps._Balances = this._getPropertyColumnMapForEntity('_Balances');
    this._propColMaps._TokenApprovals = this._getPropertyColumnMapForEntity('_TokenApprovals');
    this._propColMaps._OperatorApprovals = this._getPropertyColumnMapForEntity('_OperatorApprovals');
  }
}
