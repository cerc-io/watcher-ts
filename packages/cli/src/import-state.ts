//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import assert from 'assert';
import path from 'path';
import fs from 'fs';
import debug from 'debug';
import { ConnectionOptions } from 'typeorm';

import { JsonRpcProvider } from '@ethersproject/providers';
import {
  DEFAULT_CONFIG_PATH,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  fillBlocks,
  StateKind,
  GraphWatcherInterface,
  GraphDatabase,
  updateEntitiesFromState,
  Config
} from '@cerc-io/util';

import { BaseCmd } from './base';

const log = debug('vulcanize:import-state');

interface Arguments {
  configFile: string;
  importFile: string;
}

export class ImportStateCmd {
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

  async exec (State: new() => any, graphDb?: GraphDatabase): Promise<void> {
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

    // Import data.
    const importFilePath = path.resolve(this._argv.importFile);
    const encodedImportData = fs.readFileSync(importFilePath);
    const codec = await import('@ipld/dag-cbor');
    const importData = codec.decode(Buffer.from(encodedImportData)) as any;

    // Fill the snapshot block.
    await fillBlocks(
      jobQueue,
      indexer,
      eventWatcher,
      config.jobQueue.blockDelayInMilliSecs,
      {
        prefetch: true,
        startBlock: importData.snapshotBlock.blockNumber,
        endBlock: importData.snapshotBlock.blockNumber
      }
    );

    // Fill the Contracts.
    for (const contract of importData.contracts) {
      indexer.watchContract(contract.address, contract.kind, contract.checkpoint, contract.startingBlock);
    }

    // Get the snapshot block.
    const block = await indexer.getBlockProgress(importData.snapshotBlock.blockHash);
    assert(block);

    // Fill the States.
    for (const checkpoint of importData.stateCheckpoints) {
      let state = new State();

      state = Object.assign(state, checkpoint);
      state.block = block;
      state.data = Buffer.from(codec.encode(state.data));

      state = await indexer.saveOrUpdateState(state);

      // Fill entities using State if:
      //  relationsMap defined for the watcher,
      //  graphDb instance is avaiable
      // TODO: Fill latest entity tables
      if (indexer.getRelationsMap && graphDb) {
        await updateEntitiesFromState(graphDb, indexer, state);
      }
    }

    // Mark snapshot block as completely processed.
    block.isComplete = true;
    await indexer.updateBlockProgress(block, block.lastProcessedEventIndex);
    await indexer.updateSyncStatusChainHead(block.blockHash, block.blockNumber);
    await indexer.updateSyncStatusIndexedBlock(block.blockHash, block.blockNumber);
    await indexer.updateStateSyncStatusIndexedBlock(block.blockNumber);
    await indexer.updateStateSyncStatusCheckpointBlock(block.blockNumber);

    // The 'diff_staged' and 'init' State entries are unnecessary as checkpoints have been already created for the snapshot block.
    await indexer.removeStates(block.blockNumber, StateKind.Init);
    await indexer.removeStates(block.blockNumber, StateKind.DiffStaged);

    log(`Import completed for snapshot block at height ${block.blockNumber}`);
    await database.close();
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
      importFile: {
        alias: 'i',
        type: 'string',
        demandOption: true,
        describe: 'Import file path (JSON)'
      }
    }).argv;
  }
}
