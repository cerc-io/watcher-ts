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

    await this._baseCmd.init(Database, Indexer, clients);
  }

  async exec (): Promise<void> {
    assert(this._argv);

    const database = this._baseCmd.database;
    const indexer = this._baseCmd.indexer;

    assert(database);
    assert(indexer);

    const blockHash = await indexer.processCLICheckpoint(this._argv.address, this._argv.blockHash);

    await database.close();
    log(`Created a checkpoint for contract ${this._argv.address} at block-hash ${blockHash}`);
  }
}
