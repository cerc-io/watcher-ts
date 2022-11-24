//
// Copyright 2022 Vulcanize, Inc.
//

import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';
import { PubSub } from 'graphql-subscriptions';

import { JsonRpcProvider } from '@ethersproject/providers';
import { GraphWatcher, GraphDatabase } from '@cerc-io/graph-node';
import {
  Config,
  getConfig,
  initClients,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Database as BaseDatabase,
  Clients,
  EventWatcherInterface
} from '@cerc-io/util';
import { EthClient } from '@cerc-io/ipld-eth-client';

export class BaseCmd {
  _config?: Config;
  _clients?: Clients;
  _ethProvider?: JsonRpcProvider;
  _jobQueue?: JobQueue
  _database?: DatabaseInterface;
  _indexer?: IndexerInterface;
  _graphDb?: GraphDatabase;
  _eventWatcher?: EventWatcherInterface;

  get config (): Config | undefined {
    return this._config;
  }

  get jobQueue (): JobQueue | undefined {
    return this._jobQueue;
  }

  get database (): DatabaseInterface | undefined {
    return this._database;
  }

  get graphDb (): GraphDatabase | undefined {
    return this._graphDb;
  }

  get indexer (): IndexerInterface | undefined {
    return this._indexer;
  }

  get eventWatcher (): EventWatcherInterface | undefined {
    return this._eventWatcher;
  }

  async initConfig<ConfigType> (configFile: string): Promise<ConfigType> {
    if (!this._config) {
      this._config = await getConfig(configFile);
    }

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
    clients: { [key: string]: any } = {},
    entityQueryTypeMap?: Map<any, any>,
    entityToLatestEntityMap?: Map<any, any>
  ): Promise<void> {
    assert(this._config);

    this._database = new Database(this._config.database, this._config.server);
    await this._database.init();

    const jobQueueConfig = this._config.jobQueue;
    assert(jobQueueConfig, 'Missing job queue config');

    const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
    assert(dbConnectionString, 'Missing job queue db connection string');

    this._jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
    await this._jobQueue.start();

    const { ethClient, ethProvider } = await initClients(this._config);
    this._ethProvider = ethProvider;
    this._clients = { ethClient, ...clients };

    // Check if subgraph watcher.
    if (this._config.server.subgraphPath) {
      const graphWatcher = await this._getGraphWatcher(this._database.baseDatabase, entityQueryTypeMap, entityToLatestEntityMap);
      this._indexer = new Indexer(this._config.server, this._database, this._clients, ethProvider, this._jobQueue, graphWatcher);
      await this._indexer.init();

      graphWatcher.setIndexer(this._indexer);
      await graphWatcher.init();
    } else {
      this._indexer = new Indexer(this._config.server, this._database, this._clients, ethProvider, this._jobQueue);
      await this._indexer.init();
    }
  }

  async initEventWatcher (
    EventWatcher: new(
      ethClient: EthClient,
      indexer: IndexerInterface,
      pubsub: PubSub,
      jobQueue: JobQueue
    ) => EventWatcherInterface
  ): Promise<void> {
    assert(this._clients?.ethClient);
    assert(this._indexer);
    assert(this._jobQueue);

    // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
    // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
    const pubsub = new PubSub();
    this._eventWatcher = new EventWatcher(this._clients.ethClient, this._indexer, pubsub, this._jobQueue);
  }

  async _getGraphWatcher (
    baseDatabase: BaseDatabase,
    entityQueryTypeMap?: Map<any, any>,
    entityToLatestEntityMap?: Map<any, any>
  ): Promise<GraphWatcher> {
    assert(this._config);
    assert(this._clients?.ethClient);
    assert(this._ethProvider);

    this._graphDb = new GraphDatabase(this._config.server, baseDatabase, entityQueryTypeMap, entityToLatestEntityMap);
    await this._graphDb.init();

    return new GraphWatcher(this._graphDb, this._clients.ethClient, this._ethProvider, this._config.server);
  }
}
