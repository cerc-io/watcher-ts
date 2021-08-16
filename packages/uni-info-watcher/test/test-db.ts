//
// Copyright 2021 Vulcanize, Inc.
//

import { QueryRunner, FindConditions } from 'typeorm';

import { Database } from '../src/database';
import { BlockProgress } from '../src/entity/BlockProgress';
import { Token } from '../src/entity/Token';

export class TestDatabase extends Database {
  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<void> {
    const repo = queryRunner.manager.getRepository(entity);

    const entities = await repo.find(findConditions);
    await repo.remove(entities);
  }

  async isEmpty (): Promise<boolean> {
    const dbTx = await this.createTransactionRunner();
    try {
      const dataBP = await this.getEntities(dbTx, BlockProgress, {}, {}, { limit: 1 });
      const dataToken = await this.getEntities(dbTx, Token, {}, {}, { limit: 1 });
      const dataSyncStatus = await this.getSyncStatus(dbTx);
      if (dataBP.length > 0 || dataToken.length > 0 || dataSyncStatus) {
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
