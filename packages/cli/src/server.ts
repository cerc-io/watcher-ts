//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';
import { PubSub } from 'graphql-subscriptions';
import express, { Application } from 'express';
import { ApolloServer } from 'apollo-server-express';

import { JsonRpcProvider } from '@ethersproject/providers';
import { GraphWatcher } from '@cerc-io/graph-node';
import { EthClient } from '@cerc-io/ipld-eth-client';
import {
  DEFAULT_CONFIG_PATH,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  EventWatcherInterface,
  KIND_ACTIVE,
  createAndStartServer,
  startGQLMetricsServer
} from '@cerc-io/util';
import { TypeSource } from '@graphql-tools/utils';

import { BaseCmd } from './base';

interface Arguments {
  configFile: string;
}

export class ServerCmd {
  _argv?: Arguments
  _baseCmd: BaseCmd;

  constructor () {
    this._baseCmd = new BaseCmd();
  }

  async initConfig<ConfigType> (): Promise<ConfigType> {
    this._argv = this._getArgv();
    assert(this._argv);

    return this._baseCmd.initConfig(this._argv.configFile);
  }

  async init (
    Database: new (config: ConnectionOptions,
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
    EventWatcher: new(
      ethClient: EthClient,
      indexer: IndexerInterface,
      pubsub: PubSub,
      jobQueue: JobQueue
    ) => EventWatcherInterface,
    clients: { [key: string]: any } = {},
    entityQueryTypeMap?: Map<any, any>,
    entityToLatestEntityMap?: Map<any, any>
  ): Promise<void> {
    await this.initConfig();

    await this._baseCmd.init(Database, Indexer, clients, entityQueryTypeMap, entityToLatestEntityMap);
    await this._baseCmd.initEventWatcher(EventWatcher);
  }

  async exec (
    createResolvers: (indexer: IndexerInterface, eventWatcher: EventWatcherInterface) => Promise<any>,
    typeDefs: TypeSource
  ): Promise<{
    app: Application,
    server: ApolloServer
  }> {
    const config = this._baseCmd.config;
    const jobQueue = this._baseCmd.jobQueue;
    const indexer = this._baseCmd.indexer;
    const eventWatcher = this._baseCmd.eventWatcher;

    assert(config);
    assert(jobQueue);
    assert(indexer);
    assert(eventWatcher);

    if (config.server.kind === KIND_ACTIVE) {
      // Delete jobs to prevent creating jobs after completion of processing previous block.
      await jobQueue.deleteAllJobs();
      await eventWatcher.start();
    }

    const resolvers = await createResolvers(indexer, eventWatcher);

    // Create an Express app
    const app: Application = express();
    const server = await createAndStartServer(app, typeDefs, resolvers, config.server);

    await startGQLMetricsServer(config);

    return { app, server };
  }

  _getArgv (): any {
    return yargs(hideBin(process.argv))
      .option('f', {
        alias: 'config-file',
        demandOption: true,
        describe: 'configuration file path (toml)',
        type: 'string',
        default: DEFAULT_CONFIG_PATH
      })
      .argv;
  }
}
