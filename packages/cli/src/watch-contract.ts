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
  getConfig,
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

export class WatchContractCmd extends BaseCmd {
  _argv?: Arguments;

  async initConfig<ConfigType> (): Promise<ConfigType> {
    this._argv = this._getArgv();
    assert(this._argv);

    this._config = await getConfig(this._argv.configFile);
    assert(this._config);

    return this._config as any;
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
    if (!this._config) {
      await this.initConfig();
    }

    super.initBase(Database, Indexer, clients);
  }

  async exec (): Promise<void> {
    assert(this._argv);
    assert(this._database);
    assert(this._indexer);
    assert(this._indexer.watchContract);

    await this._indexer.watchContract(this._argv.address, this._argv.kind, this._argv.checkpoint, this._argv.startingBlock);
    await this._database.close();
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
