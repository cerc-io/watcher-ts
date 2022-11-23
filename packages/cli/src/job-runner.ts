//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import 'reflect-metadata';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';

import { JsonRpcProvider } from '@ethersproject/providers';
import { GraphWatcher } from '@cerc-io/graph-node';
import {
  DEFAULT_CONFIG_PATH,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  JobRunner as BaseJobRunner,
  JobQueueConfig,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  QUEUE_BLOCK_CHECKPOINT,
  QUEUE_HOOKS,
  startMetricsServer
} from '@cerc-io/util';

import { BaseCmd } from './base';

interface Arguments {
  configFile: string;
}

export class JobRunnerCmd {
  _argv?: Arguments
  _baseCmd: BaseCmd;

  constructor () {
    this._baseCmd = new BaseCmd();
  }

  get jobQueue (): JobQueue | undefined {
    return this._baseCmd.jobQueue;
  }

  get indexer (): IndexerInterface | undefined {
    return this._baseCmd.indexer;
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
    clients: { [key: string]: any } = {},
    entityQueryTypeMap?: Map<any, any>,
    entityToLatestEntityMap?: Map<any, any>
  ): Promise<void> {
    await this.initConfig();

    await this._baseCmd.init(Database, Indexer, clients, entityQueryTypeMap, entityToLatestEntityMap);
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

    const jobRunner = new JobRunner(config.jobQueue, indexer, jobQueue);

    await jobRunner.jobQueue.deleteAllJobs();
    await jobRunner.baseJobRunner.resetToPrevIndexedBlock();

    await startJobRunner(jobRunner);
    jobRunner.baseJobRunner.handleShutdown();

    await startMetricsServer(config, indexer);
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

export class JobRunner {
  jobQueue: JobQueue
  baseJobRunner: BaseJobRunner
  _indexer: IndexerInterface
  _jobQueueConfig: JobQueueConfig

  constructor (jobQueueConfig: JobQueueConfig, indexer: IndexerInterface, jobQueue: JobQueue) {
    this._jobQueueConfig = jobQueueConfig;
    this._indexer = indexer;
    this.jobQueue = jobQueue;
    this.baseJobRunner = new BaseJobRunner(this._jobQueueConfig, this._indexer, this.jobQueue);
  }

  async subscribeBlockProcessingQueue (): Promise<void> {
    await this.jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this.baseJobRunner.processBlock(job);
    });
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this.jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
      await this.baseJobRunner.processEvent(job);
    });
  }

  async subscribeHooksQueue (): Promise<void> {
    await this.jobQueue.subscribe(QUEUE_HOOKS, async (job) => {
      await this.baseJobRunner.processHooks(job);
    });
  }

  async subscribeBlockCheckpointQueue (): Promise<void> {
    await this.jobQueue.subscribe(QUEUE_BLOCK_CHECKPOINT, async (job) => {
      await this.baseJobRunner.processCheckpoint(job);
    });
  }
}
