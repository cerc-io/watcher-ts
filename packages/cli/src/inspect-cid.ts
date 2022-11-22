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

const log = debug('vulcanize:inspect-cid');

interface Arguments {
  configFile: string;
  cid: string;
}

export class InspectCIDCmd {
  _argv?: Arguments
  _baseCmd: BaseCmd;
  _database?: DatabaseInterface;
  _indexer?: IndexerInterface;

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

    ({ database: this._database, indexer: this._indexer } = await this._baseCmd.init(Database, Indexer, clients));
  }

  async exec (): Promise<void> {
    assert(this._argv);
    assert(this._database);
    assert(this._indexer);

    const state = await this._indexer.getStateByCID(this._argv.cid);
    assert(state, 'State for the provided CID doesn\'t exist.');

    const stateData = await this._indexer.getStateData(state);
    log(util.inspect(stateData, false, null));

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
      cid: {
        alias: 'c',
        type: 'string',
        demandOption: true,
        describe: 'CID to be inspected'
      }
    }).argv;
  }
}
