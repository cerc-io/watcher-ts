//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { Connection, ConnectionOptions, DeepPartial, FindConditions, QueryRunner, FindManyOptions } from 'typeorm';
import path from 'path';

import { IPLDDatabase as BaseDatabase, IPLDDatabaseInterface, QueryOptions, StateKind, Where } from '@vulcanize/util';

import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { IpldStatus } from './entity/IpldStatus';
import { BlockProgress } from './entity/BlockProgress';
import { IPLDBlock } from './entity/IPLDBlock';
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

  getNewIPLDBlock (): IPLDBlock {
    return new IPLDBlock();
  }

  async getIPLDBlocks (where: FindConditions<IPLDBlock>): Promise<IPLDBlock[]> {
    const repo = this._conn.getRepository(IPLDBlock);

    return this._baseDatabase.getIPLDBlocks(repo, where);
  }

  async getLatestIPLDBlock (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<IPLDBlock | undefined> {
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
    const repo = dbTx.manager.getRepository(IPLDBlock);

    await this._baseDatabase.removeIPLDBlocks(repo, blockNumber, kind);
  }

  async getIPLDStatus (): Promise<IpldStatus | undefined> {
    const repo = this._conn.getRepository(IpldStatus);

    return this._baseDatabase.getIPLDStatus(repo);
  }

  async updateIPLDStatusHooksBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const repo = queryRunner.manager.getRepository(IpldStatus);

    return this._baseDatabase.updateIPLDStatusHooksBlock(repo, blockNumber, force);
  }

  async updateIPLDStatusCheckpointBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const repo = queryRunner.manager.getRepository(IpldStatus);

    return this._baseDatabase.updateIPLDStatusCheckpointBlock(repo, blockNumber, force);
  }

  async updateIPLDStatusIPFSBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const repo = queryRunner.manager.getRepository(IpldStatus);

    return this._baseDatabase.updateIPLDStatusIPFSBlock(repo, blockNumber, force);
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
    this._propColMaps._Name = this._getPropertyColumnMapForEntity('_Name');
    this._propColMaps._Symbol = this._getPropertyColumnMapForEntity('_Symbol');
    this._propColMaps._Owners = this._getPropertyColumnMapForEntity('_Owners');
    this._propColMaps._Balances = this._getPropertyColumnMapForEntity('_Balances');
    this._propColMaps._TokenApprovals = this._getPropertyColumnMapForEntity('_TokenApprovals');
    this._propColMaps._OperatorApprovals = this._getPropertyColumnMapForEntity('_OperatorApprovals');
  }
}