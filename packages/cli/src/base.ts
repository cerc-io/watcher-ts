//
// Copyright 2022 Vulcanize, Inc.
//

import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';

import { JsonRpcProvider } from '@ethersproject/providers';
import { GraphWatcher, Database as GraphDatabase } from '@cerc-io/graph-node';
import {
  Config,
  initClients,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Database as BaseDatabase,
  Clients
} from '@cerc-io/util';

export class BaseCmd {
  _config?: Config;
  _clients?: Clients;
  _ethProvider?: JsonRpcProvider;
  _database?: DatabaseInterface;
  _indexer?: IndexerInterface;

  async initBase (
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

  async _getGraphWatcher (baseDatabase: BaseDatabase): Promise<GraphWatcher> {
    assert(this._config);
    assert(this._clients?.ethClient);
    assert(this._ethProvider);

    const graphDb = new GraphDatabase(this._config.server, baseDatabase);
    await graphDb.init();

    return new GraphWatcher(graphDb, this._clients.ethClient, this._ethProvider, this._config.server);
  }
}
