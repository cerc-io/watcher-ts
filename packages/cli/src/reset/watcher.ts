//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';
import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';

import { JsonRpcProvider } from '@ethersproject/providers';
import { GraphWatcher } from '@cerc-io/graph-node';
import {
  getConfig,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients
} from '@cerc-io/util';

import { BaseCmd } from '../base';

const log = debug('vulcanize:reset-watcher');

interface Arguments {
  configFile: string;
  blockNumber: number;
}

export class ResetWatcherCmd extends BaseCmd {
  _argv?: Arguments

  async initConfig<ConfigType> (configFile: string): Promise<ConfigType> {
    this._config = await getConfig(configFile);
    assert(this._config);

    return this._config as any;
  }

  async init (
    argv: any,
    Database: new (
      config: ConnectionOptions,
      serverConfig?: ServerConfig
    ) => DatabaseInterface,
    Indexer: new (
      serverConfig: ServerConfig,
      db: DatabaseInterface,
      clients: Clients,
      ethProvider: JsonRpcProvider,
      jobQueue: JobQueue,
      graphWatcher?: GraphWatcher
    ) => IndexerInterface,
    clients: { [key: string]: any } = {}
  ): Promise<void> {
    this._argv = argv;
    if (!this._config) {
      await this.initConfig(argv.configFile);
    }

    await this.initBase(Database, Indexer, clients);
  }

  async exec (): Promise<void> {
    assert(this._argv);
    assert(this._indexer);

    await this._indexer.resetWatcherToBlock(this._argv.blockNumber);
    log('Reset watcher successfully');
  }
}
