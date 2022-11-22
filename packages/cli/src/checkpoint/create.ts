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
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients
} from '@cerc-io/util';

import { BaseCmd } from '../base';

const log = debug('vulcanize:checkpoint-create');

interface Arguments {
  configFile: string;
  address: string;
  blockHash: string;
}

export class CreateCheckpointCmd {
  _argv?: Arguments
  _baseCmd: BaseCmd
  _database?: DatabaseInterface
  _indexer?: IndexerInterface

  constructor () {
    this._baseCmd = new BaseCmd();
  }

  async initConfig<ConfigType> (configFile: string): Promise<ConfigType> {
    return this._baseCmd.initConfig(configFile);
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
    await this.initConfig(argv.configFile);

    ({ database: this._database, indexer: this._indexer } = await this._baseCmd.init(Database, Indexer, clients));
  }

  async exec (): Promise<void> {
    assert(this._argv);
    assert(this._database);
    assert(this._indexer);

    const blockHash = await this._indexer.processCLICheckpoint(this._argv.address, this._argv.blockHash);

    await this._database.close();
    log(`Created a checkpoint for contract ${this._argv.address} at block-hash ${blockHash}`);
  }
}
