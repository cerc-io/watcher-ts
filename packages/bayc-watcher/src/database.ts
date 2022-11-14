//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { Connection, ConnectionOptions, DeepPartial, FindConditions, QueryRunner, FindManyOptions, EntityTarget } from 'typeorm';
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
import { TotalSupply } from './entity/TotalSupply';
import { TokenOfOwnerByIndex } from './entity/TokenOfOwnerByIndex';
import { TokenByIndex } from './entity/TokenByIndex';
import { BaseURI } from './entity/BaseURI';
import { Owner } from './entity/Owner';

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

  async getTotalSupply ({ blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<TotalSupply | undefined> {
    return this._conn.getRepository(TotalSupply)
      .findOne({
        blockHash,
        contractAddress
      });
  }

  async getTokenOfOwnerByIndex ({ blockHash, contractAddress, owner, index }: { blockHash: string, contractAddress: string, owner: string, index: bigint }): Promise<TokenOfOwnerByIndex | undefined> {
    return this._conn.getRepository(TokenOfOwnerByIndex)
      .findOne({
        blockHash,
        contractAddress,
        owner,
        index
      });
  }

  async getTokenByIndex ({ blockHash, contractAddress, index }: { blockHash: string, contractAddress: string, index: bigint }): Promise<TokenByIndex | undefined> {
    return this._conn.getRepository(TokenByIndex)
      .findOne({
        blockHash,
        contractAddress,
        index
      });
  }

  async getBaseURI ({ blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<BaseURI | undefined> {
    return this._conn.getRepository(BaseURI)
      .findOne({
        blockHash,
        contractAddress
      });
  }

  async getOwner ({ blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<Owner | undefined> {
    return this._conn.getRepository(Owner)
      .findOne({
        blockHash,
        contractAddress
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

  async saveTotalSupply ({ blockHash, blockNumber, contractAddress, value, proof }: DeepPartial<TotalSupply>): Promise<TotalSupply> {
    const repo = this._conn.getRepository(TotalSupply);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, value, proof });
    return repo.save(entity);
  }

  async saveTokenOfOwnerByIndex ({ blockHash, blockNumber, contractAddress, owner, index, value, proof }: DeepPartial<TokenOfOwnerByIndex>): Promise<TokenOfOwnerByIndex> {
    const repo = this._conn.getRepository(TokenOfOwnerByIndex);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, owner, index, value, proof });
    return repo.save(entity);
  }

  async saveTokenByIndex ({ blockHash, blockNumber, contractAddress, index, value, proof }: DeepPartial<TokenByIndex>): Promise<TokenByIndex> {
    const repo = this._conn.getRepository(TokenByIndex);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, index, value, proof });
    return repo.save(entity);
  }

  async saveBaseURI ({ blockHash, blockNumber, contractAddress, value, proof }: DeepPartial<BaseURI>): Promise<BaseURI> {
    const repo = this._conn.getRepository(BaseURI);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, value, proof });
    return repo.save(entity);
  }

  async saveOwner ({ blockHash, blockNumber, contractAddress, value, proof }: DeepPartial<Owner>): Promise<Owner> {
    const repo = this._conn.getRepository(Owner);
    const entity = repo.create({ blockHash, blockNumber, contractAddress, value, proof });
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
    this._propColMaps.TotalSupply = this._getPropertyColumnMapForEntity('TotalSupply');
    this._propColMaps.TokenOfOwnerByIndex = this._getPropertyColumnMapForEntity('TokenOfOwnerByIndex');
    this._propColMaps.TokenByIndex = this._getPropertyColumnMapForEntity('TokenByIndex');
    this._propColMaps.BaseURI = this._getPropertyColumnMapForEntity('BaseURI');
    this._propColMaps.Owner = this._getPropertyColumnMapForEntity('Owner');
  }
}
