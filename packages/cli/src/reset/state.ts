//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';
import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';

import {
  Config,
  getConfig,
  DatabaseInterface,
  ServerConfig
} from '@cerc-io/util';

const log = debug('vulcanize:reset-state');

interface Arguments {
  configFile: string;
  blockNumber: number;
}

export class ResetStateCmd {
  _argv?: Arguments;
  _config?: Config;
  _database?: DatabaseInterface;

  async initConfig (configFile: string): Promise<Config> {
    this._config = await getConfig(configFile);
    assert(this._config);

    return this._config;
  }

  async init (
    argv: any,
    Database: new (
      config: ConnectionOptions,
      serverConfig?: ServerConfig
    ) => DatabaseInterface
  ): Promise<void> {
    this._argv = argv;
    if (!this._config) {
      await this.initConfig(argv.configFile);
    }
    assert(this._config);

    this._database = new Database(this._config.database, this._config.server);
    await this._database.init();
  }

  async exec (): Promise<void> {
    assert(this._argv);
    assert(this._database);

    // Create a DB transaction
    const dbTx = await this._database.createTransactionRunner();

    console.time('time:reset-state');
    const { blockNumber } = this._argv;
    try {
      // Delete all State entries after the given block
      await this._database.removeStatesAfterBlock(dbTx, blockNumber);

      // Reset the stateSyncStatus.
      const stateSyncStatus = await this._database.getStateSyncStatus();

      if (stateSyncStatus) {
        if (stateSyncStatus.latestIndexedBlockNumber > blockNumber) {
          await this._database.updateStateSyncStatusIndexedBlock(dbTx, blockNumber, true);
        }

        if (stateSyncStatus.latestCheckpointBlockNumber > blockNumber) {
          await this._database.updateStateSyncStatusCheckpointBlock(dbTx, blockNumber, true);
        }
      }

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
    console.timeEnd('time:reset-state');

    this._database.close();
    log(`Reset state successfully to block ${blockNumber}`);
  }
}
