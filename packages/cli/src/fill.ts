//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ConnectionOptions } from 'typeorm';

import { JsonRpcProvider } from '@ethersproject/providers';
import {
  fillState,
  DEFAULT_CONFIG_PATH,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  fillBlocks,
  GraphWatcherInterface,
  Config
} from '@cerc-io/util';

import { BaseCmd } from './base';

const log = debug('vulcanize:fill');

interface Arguments {
  configFile: string;
  startBlock: number;
  endBlock: number;
  prefetch: boolean;
  batchBlocks: number;
  state: boolean;
}

export class FillCmd {
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
    clients: { [key: string]: any } = {}
  ): Promise<void> {
    await this.initConfig();

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
    await this._baseCmd.initIndexer(Indexer, graphWatcher);
    await this._baseCmd.initEventWatcher();
  }

  async exec (contractEntitiesMap: Map<string, string[]> = new Map()): Promise<void> {
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

    if (this._argv.state) {
      assert(config.server.enableState, 'State creation disabled');

      const { startBlock, endBlock } = this._argv;

      // NOTE: Assuming all blocks in the given range are in the pruned region
      log(`Filling state for subgraph entities in range: [${startBlock}, ${endBlock}]`);
      await fillState(indexer, contractEntitiesMap, this._argv);
      log(`Filled state for subgraph entities in range: [${startBlock}, ${endBlock}]`);
    } else {
      await fillBlocks(jobQueue, indexer, eventWatcher, config.jobQueue.blockDelayInMilliSecs, this._argv);
    }

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
