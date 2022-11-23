//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';

import { JsonRpcProvider } from '@ethersproject/providers';
import { GraphWatcher } from '@cerc-io/graph-node';
import {
  DEFAULT_CONFIG_PATH,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  indexBlock
} from '@cerc-io/util';

import { BaseCmd } from './base';

interface Arguments {
  configFile: string;
  block: number;
}

export class IndexBlockCmd {
  _argv?: Arguments;
  _baseCmd: BaseCmd;

  constructor () {
    this._baseCmd = new BaseCmd();
  }

  async initConfig<ConfigType> (): Promise<ConfigType> {
    this._argv = this._getArgv();
    assert(this._argv);

    return this._baseCmd.initConfig(this._argv.configFile);
  }

  async init (
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
    await this.initConfig();

    await this._baseCmd.init(Database, Indexer, clients);
  }

  async exec (): Promise<void> {
    assert(this._argv);

    const config = this._baseCmd.config;
    const indexer = this._baseCmd.indexer;
    const database = this._baseCmd.database;

    assert(config);
    assert(indexer);
    assert(database);

    await indexBlock(indexer, config.jobQueue.eventsInBatch, this._argv);

    await database.close();
  }

  _getArgv (): any {
    return yargs.parserConfiguration({
      'parse-numbers': false
    }).options({
      configFile: {
        alias: 'f',
        type: 'string',
        require: true,
        demandOption: true,
        describe: 'Configuration file path (toml)',
        default: DEFAULT_CONFIG_PATH
      },
      block: {
        type: 'number',
        require: true,
        demandOption: true,
        describe: 'Block number to index'
      }
    }).argv;
  }
}
