import assert from 'assert';
import { Connection, ConnectionOptions, createConnection } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { Address } from './entity/Address';

export class Database {
  _config: ConnectionOptions
  _conn!: Connection

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
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
    const numRows = await this._conn.getRepository(Address)
      .createQueryBuilder()
      .where('address = :address', { address })
      .getCount();

    return numRows > 0;
  }

  async saveAddress (address: string, startingBlock: number): Promise<void> {
    await this._conn.transaction(async (tx) => {
      const repo = tx.getRepository(Address);

      const numRows = await repo
        .createQueryBuilder()
        .where('address = :address', { address })
        .getCount();

      if (numRows === 0) {
        const entity = repo.create({ address, startingBlock: BigInt(startingBlock) });
        await repo.save(entity);
      }
    });
  }
}
