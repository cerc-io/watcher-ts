//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { Connection, ConnectionOptions, createConnection, DeepPartial } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import path from 'path';

import { Account } from './entity/Account';
import { BlockProgress } from './entity/BlockProgress';
import { Trace } from './entity/Trace';

export class Database {
  _config: ConnectionOptions;
  _conn!: Connection;

  constructor (config: ConnectionOptions) {
    assert(config);

    this._config = {
      ...config,
      entities: [path.join(__dirname, 'entity/*')]
    };
  }

  async init (): Promise<void> {
    assert(!this._conn);

    this._conn = await createConnection({
      ...this._config,
      namingStrategy: new SnakeNamingStrategy()
    });
  }

  async close (): Promise<void> {
    return this._conn.close();
  }

  async isWatchedAddress (address: string): Promise<boolean> {
    const numRows = await this._conn.getRepository(Account)
      .createQueryBuilder()
      .where('address = :address', { address })
      .getCount();

    return numRows > 0;
  }

  async saveAccount (address: string, startingBlock: number): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Account);

      const numRows = await repo
        .createQueryBuilder()
        .where('address = :address', { address })
        .getCount();

      if (numRows === 0) {
        const entity = repo.create({ address, startingBlock });
        await repo.save(entity);
      }
    });
  }

  async getAccount (address: string): Promise<Account | undefined> {
    return this._conn.getRepository(Account)
      .createQueryBuilder()
      .where('address = :address', { address })
      .getOne();
  }

  async getTrace (txHash: string): Promise<Trace | undefined> {
    const repo = this._conn.getRepository(Trace);
    return repo.findOne({ where: { txHash } });
  }

  async saveTrace ({ txHash, blockNumber, blockHash, trace }: DeepPartial<Trace>): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Trace);

      const numRows = await repo
        .createQueryBuilder()
        .where('tx_hash = :txHash', { txHash })
        .getCount();

      if (numRows === 0) {
        const entity = repo.create({ txHash, blockNumber, blockHash, trace });
        await repo.save(entity);
      }
    });
  }

  async saveTraceEntity (trace: Trace): Promise<Trace> {
    const repo = this._conn.getRepository(Trace);
    return repo.save(trace);
  }

  async getAppearances (address: string, fromBlockNumber: number, toBlockNumber: number): Promise<Trace[]> {
    return this._conn.getRepository(Trace)
      .createQueryBuilder('trace')
      .leftJoinAndSelect('trace.accounts', 'account')
      .where('address = :address AND block_number >= :fromBlockNumber AND block_number <= :toBlockNumber', { address, fromBlockNumber, toBlockNumber })
      .orderBy({ block_number: 'ASC' })
      .getMany();
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    const repo = this._conn.getRepository(BlockProgress);
    return repo.findOne({ where: { blockHash } });
  }

  async initBlockProgress (blockHash: string, blockNumber: number, numTx: number): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(BlockProgress);

      const numRows = await repo
        .createQueryBuilder()
        .where('block_hash = :blockHash', { blockHash })
        .getCount();

      if (numRows === 0) {
        const entity = repo.create({ blockHash, blockNumber, numTx, numTracedTx: 0, isComplete: (numTx === 0) });
        await repo.save(entity);
      }
    });
  }

  async updateBlockProgress (blockHash: string): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(BlockProgress);
      const entity = await repo.findOne({ where: { blockHash } });
      if (entity && !entity.isComplete) {
        entity.numTracedTx++;
        if (entity.numTracedTx >= entity.numTx) {
          entity.isComplete = true;
        }
        await repo.save(entity);
      }
    });
  }
}
