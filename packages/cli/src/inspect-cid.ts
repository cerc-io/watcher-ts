//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';
import yargs from 'yargs';
import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';
import util from 'util';

import { JsonRpcProvider } from '@ethersproject/providers';
import {
  DEFAULT_CONFIG_PATH,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  GraphWatcherInterface,
  Config
} from '@cerc-io/util';

import { BaseCmd } from './base';

const log = debug('vulcanize:inspect-cid');

interface Arguments {
  configFile: string;
  cid: string;
}

export class InspectCIDCmd {
  _argv?: Arguments;
  _baseCmd: BaseCmd;

  constructor () {
    this._baseCmd = new BaseCmd();
  }

  get config (): Config {
    return this._baseCmd.config;
  }

  get clients (): Clients {
    return this._baseCmd.clients;
  }

  get ethProvider (): JsonRpcProvider {
    return this._baseCmd.ethProvider;
  }

  get database (): DatabaseInterface {
    return this._baseCmd.database;
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
    clients: { [key: string]: any } = {}
  ): Promise<void> {
    await this.initConfig();

    await this._baseCmd.init(Database, clients);
  }

  async initIndexer (
    Indexer: new (
      serverConfig: ServerConfig,
      db: DatabaseInterface,
      clients: Clients,
      ethProvider: JsonRpcProvider,
      jobQueue: JobQueue,
      graphWatcher?: GraphWatcherInterface
    ) => IndexerInterface,
    graphWatcher?: GraphWatcherInterface
  ): Promise<void> {
    return this._baseCmd.initIndexer(Indexer, graphWatcher);
  }

  async exec (): Promise<void> {
    assert(this._argv);

    const database = this._baseCmd.database;
    const indexer = this._baseCmd.indexer;

    assert(database);
    assert(indexer);

    const state = await indexer.getStateByCID(this._argv.cid);
    assert(state, 'State for the provided CID doesn\'t exist.');

    const stateData = await indexer.getStateData(state);
    log(util.inspect(stateData, false, null));

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
      cid: {
        alias: 'c',
        type: 'string',
        demandOption: true,
        describe: 'CID to be inspected'
      }
    }).argv;
  }
}
