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
  Clients
} from '@cerc-io/util';

import { BaseCmd } from './base';

interface Arguments {
  configFile: string;
  address: string;
  kind: string;
  checkpoint: boolean;
  startingBlock: number;
}

export class WatchContractCmd {
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

    const database = this._baseCmd.database;
    const indexer = this._baseCmd.indexer;

    assert(database);
    assert(indexer);

    assert(indexer.watchContract);
    await indexer.watchContract(this._argv.address, this._argv.kind, this._argv.checkpoint, this._argv.startingBlock);
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
      address: {
        type: 'string',
        require: true,
        demandOption: true,
        describe: 'Address of the deployed contract'
      },
      kind: {
        type: 'string',
        require: true,
        demandOption: true,
        describe: 'Kind of contract'
      },
      checkpoint: {
        type: 'boolean',
        require: true,
        demandOption: true,
        describe: 'Turn checkpointing on'
      },
      startingBlock: {
        type: 'number',
        default: 1,
        describe: 'Starting block'
      }
    }).argv;
  }
}
