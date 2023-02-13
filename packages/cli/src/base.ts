//
// Copyright 2022 Vulcanize, Inc.
//

import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';
import { PubSub } from 'graphql-subscriptions';

import { JsonRpcProvider } from '@ethersproject/providers';
import {
  Config,
  getConfig,
  initClients,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  EventWatcher,
  GraphWatcherInterface
} from '@cerc-io/util';

export class BaseCmd {
  _config?: Config;
  _clients?: Clients;
  _ethProvider?: JsonRpcProvider;
  _jobQueue?: JobQueue;
  _database?: DatabaseInterface;
  _indexer?: IndexerInterface;
  _eventWatcher?: EventWatcher;

  get config (): Config {
    assert(this._config);
    return this._config;
  }

  get clients (): Clients {
    assert(this._clients);
    return this._clients;
  }

  get ethProvider (): JsonRpcProvider {
    assert(this._ethProvider);
    return this._ethProvider;
  }

  get jobQueue (): JobQueue {
    assert(this._jobQueue);
    return this._jobQueue;
  }

  get database (): DatabaseInterface {
    assert(this._database);
    return this._database;
  }

  get indexer (): IndexerInterface {
    assert(this._indexer);
    return this._indexer;
  }

  get eventWatcher (): EventWatcher {
    assert(this._eventWatcher);
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
    clients: { [key: string]: any } = {}
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
    assert(this._config);
    assert(this._database);
    assert(this._clients);
    assert(this._ethProvider);
    assert(this._jobQueue);

    this._indexer = new Indexer(this._config.server, this._database, this._clients, this._ethProvider, this._jobQueue, graphWatcher);
    await this._indexer.init();

    if (graphWatcher) {
      graphWatcher.setIndexer(this._indexer);
      await graphWatcher.init();
    }
  }

  async initEventWatcher (): Promise<void> {
    assert(this._clients?.ethClient);
    assert(this._indexer);
    assert(this._jobQueue);

    // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
    // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
    const pubsub = new PubSub();
    this._eventWatcher = new EventWatcher(this._clients.ethClient, this._indexer, pubsub, this._jobQueue);
  }
}
