//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ConnectionOptions } from 'typeorm';
import { PubSub } from 'graphql-subscriptions';

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
  fillBlocks
} from '@cerc-io/util';

import { BaseCmd } from './base';

interface Arguments {
  configFile: string;
  startBlock: number;
  endBlock: number;
  prefetch: boolean;
  batchBlocks: number;
  state: boolean;
}

export class FillCmd {
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

  async exec (): Promise<void> {
    assert(this._argv);

    const config = this._baseCmd.config;
    const jobQueue = this._baseCmd.jobQueue;
    const database = this._baseCmd.database;
    const indexer = this._baseCmd.indexer;
    const eventWatcher = this._baseCmd.eventWatcher;

    assert(config);
    assert(jobQueue);
    assert(database);
    assert(indexer);
    assert(eventWatcher);

    // if (this._argv.state) {
    //   assert(config.server.enableState, 'State creation disabled');
    //   await fillState(indexer, graphDb, graphWatcher.dataSources, argv);
    //   return;
    // }

    await fillBlocks(jobQueue, indexer, eventWatcher, config.jobQueue.blockDelayInMilliSecs, this._argv);
    await database.close();
  }

  _getArgv (): any {
    return yargs(hideBin(process.argv)).parserConfiguration({
      'parse-numbers': false
    }).env(
      'FILL'
    ).options({
      configFile: {
        alias: 'f',
        type: 'string',
        require: true,
        demandOption: true,
        describe: 'Configuration file path (toml)',
        default: DEFAULT_CONFIG_PATH
      },
      startBlock: {
        type: 'number',
        demandOption: true,
        describe: 'Block number to start processing at'
      },
      endBlock: {
        type: 'number',
        demandOption: true,
        describe: 'Block number to stop processing at'
      },
      prefetch: {
        type: 'boolean',
        default: false,
        describe: 'Block and events prefetch mode'
      },
      batchBlocks: {
        type: 'number',
        default: 10,
        describe: 'Number of blocks prefetched in batch'
      },
      state: {
        type: 'boolean',
        default: false,
        describe: 'Fill state for subgraph entities'
      }
    }).argv;
  }
}
