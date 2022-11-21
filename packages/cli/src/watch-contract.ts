//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';

import { JsonRpcProvider } from '@ethersproject/providers';
import { GraphWatcher, Database as GraphDatabase } from '@cerc-io/graph-node';
import { EthClient } from '@cerc-io/ipld-eth-client';
import {
  DEFAULT_CONFIG_PATH,
  Config,
  getConfig,
  initClients,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Database as BaseDatabase,
  Clients
} from '@cerc-io/util';

interface Arguments {
  [x: string]: unknown;
  configFile: string;
  address: string;
  kind: string;
  checkpoint: boolean;
  startingBlock: number;
}

export class WatchContractCmd {
  _argv?: Arguments
  _config?: Config;
  _clients?: Clients;
  _ethClient?: EthClient;
  _ethProvider?: JsonRpcProvider
  _database?: DatabaseInterface
  _indexer?: IndexerInterface

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
    assert(this._config);

    this._database = new Database(this._config.database, this._config.server);
    await this._database.init();

    const jobQueueConfig = this._config.jobQueue;
    assert(jobQueueConfig, 'Missing job queue config');

    const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
    assert(dbConnectionString, 'Missing job queue db connection string');

    const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
    await jobQueue.start();

    const { ethClient, ethProvider } = await initClients(this._config);
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._clients = { ethClient, ...clients };

    // Check if subgraph watcher.
    if (this._config.server.subgraphPath) {
      const graphWatcher = await this._getGraphWatcher(this._database.baseDatabase);
      this._indexer = new Indexer(this._config.server, this._database, this._clients, ethProvider, jobQueue, graphWatcher);
      await this._indexer.init();

      graphWatcher.setIndexer(this._indexer);
      await graphWatcher.init();
    } else {
      this._indexer = new Indexer(this._config.server, this._database, this._clients, ethProvider, jobQueue);
      await this._indexer.init();
    }
  }

  async exec (): Promise<void> {
    assert(this._argv);
    assert(this._database);
    assert(this._indexer);
    assert(this._indexer.watchContract);

    await this._indexer.watchContract(this._argv.address, this._argv.kind, this._argv.checkpoint, this._argv.startingBlock);
    await this._database.close();
  }

  async _getGraphWatcher (baseDatabase: BaseDatabase): Promise<GraphWatcher> {
    assert(this._config);
    assert(this._ethClient);
    assert(this._ethProvider);

    const graphDb = new GraphDatabase(this._config.server, baseDatabase);
    await graphDb.init();

    return new GraphWatcher(graphDb, this._ethClient, this._ethProvider, this._config.server);
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
