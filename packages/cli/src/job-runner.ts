//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';
import { errors } from 'ethers';
import debug from 'debug';

import { JsonRpcProvider } from '@ethersproject/providers';
import {
  DEFAULT_CONFIG_PATH,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  JobRunner,
  GraphWatcherInterface,
  startMetricsServer,
  Config,
  UpstreamConfig,
  NEW_BLOCK_MAX_RETRIES_ERROR,
  setActiveUpstreamEndpointMetric
} from '@cerc-io/util';

import { BaseCmd } from './base';
import { initClients } from './utils/index';

const log = debug('vulcanize:job-runner');

interface Arguments {
  configFile: string;
}

export class JobRunnerCmd {
  _argv?: Arguments;
  _baseCmd: BaseCmd;

  _currentEndpointIndex = {
    rpcProviderEndpoint: 0
  };

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

  get jobQueue (): JobQueue {
    return this._baseCmd.jobQueue;
  }

  get indexer (): IndexerInterface {
    return this._baseCmd.indexer;
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
      config: {
        server: ServerConfig;
        upstream: UpstreamConfig;
      },
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

  async exec (startJobRunner: (jobRunner: JobRunner) => Promise<void>): Promise<void> {
    const config = this._baseCmd.config;
    const jobQueue = this._baseCmd.jobQueue;
    const indexer = this._baseCmd.indexer;

    assert(config);
    assert(jobQueue);
    assert(indexer);

    if (indexer.addContracts) {
      await indexer.addContracts();
    }

    const jobRunner = new JobRunner(
      config.jobQueue,
      indexer,
      jobQueue,
      async (error: any) => {
        // Check if it is a server error or timeout from ethers.js
        // https://docs.ethers.org/v5/api/utils/logger/#errors--server-error
        // https://docs.ethers.org/v5/api/utils/logger/#errors--timeout
        if (error.code === errors.SERVER_ERROR || error.code === errors.TIMEOUT || error.message === NEW_BLOCK_MAX_RETRIES_ERROR) {
          const oldRpcEndpoint = config.upstream.ethServer.rpcProviderEndpoints[this._currentEndpointIndex.rpcProviderEndpoint];
          ++this._currentEndpointIndex.rpcProviderEndpoint;

          if (this._currentEndpointIndex.rpcProviderEndpoint === config.upstream.ethServer.rpcProviderEndpoints.length) {
            this._currentEndpointIndex.rpcProviderEndpoint = 0;
          }

          const { ethClient, ethProvider } = await initClients(config, this._currentEndpointIndex);
          indexer.switchClients({ ethClient, ethProvider });
          setActiveUpstreamEndpointMetric(config, this._currentEndpointIndex.rpcProviderEndpoint);

          log(`RPC endpoint ${oldRpcEndpoint} is not working; failing over to new RPC endpoint ${ethProvider.connection.url}`);
        }
      });

    // Delete all active and pending (before completed) jobs to start job-runner without old queued jobs
    await jobRunner.jobQueue.deleteAllJobs('completed');

    await jobRunner.resetToLatestProcessedBlock();
    await indexer.updateSyncStatusIndexingError(false);

    await startJobRunner(jobRunner);
    jobRunner.handleShutdown();

    await startMetricsServer(config, indexer, this._currentEndpointIndex);
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
