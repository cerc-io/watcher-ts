//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';
import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';

import { JsonRpcProvider } from '@ethersproject/providers';
import {
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  verifyCheckpointData,
  GraphDatabase,
  GraphWatcherInterface,
  Config
} from '@cerc-io/util';

import { BaseCmd } from '../base';

const log = debug('vulcanize:checkpoint-verify');

interface Arguments {
  configFile: string;
  cid: string;
}

export class VerifyCheckpointCmd {
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

  async initConfig<ConfigType> (configFile: string): Promise<ConfigType> {
    return this._baseCmd.initConfig(configFile);
  }

  async init (
    argv: any,
    Database: new (
      config: ConnectionOptions,
      serverConfig?: ServerConfig
    ) => DatabaseInterface,
    clients: { [key: string]: any } = {}
  ): Promise<void> {
    this._argv = argv;
    await this.initConfig(argv.configFile);

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

  async exec (graphDb: GraphDatabase): Promise<void> {
    assert(this._argv);

    const database = this._baseCmd.database;
    const indexer = this._baseCmd.indexer;

    assert(database);
    assert(indexer);

    const state = await indexer.getStateByCID(this._argv.cid);
    assert(state, 'State for the provided CID doesn\'t exist.');
    const data = indexer.getStateData(state);

    log(`Verifying checkpoint data for contract ${state.contractAddress}`);
    await verifyCheckpointData(graphDb, state.block, data);
    log('Checkpoint data verified');

    await database.close();
  }
}
