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
  StateKind,
  Clients,
  GraphWatcherInterface,
  Config
} from '@cerc-io/util';

import { BaseCmd } from './base';

const log = debug('vulcanize:export-state');

interface Arguments {
  configFile: string;
  exportFile: string;
  blockNumber: number;
}

export class ExportStateCmd {
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
    return this._baseCmd.initIndexer(Indexer, graphWatcher);
  }

  async exec (): Promise<void> {
    assert(this._argv);

    const database = this._baseCmd.database;
    const indexer = this._baseCmd.indexer;

    assert(database);
    assert(indexer);

    const exportData: any = {
      snapshotBlock: {},
      contracts: [],
      stateCheckpoints: []
    };

    const contracts = await database.getContracts();
    let block = await indexer.getLatestStateIndexedBlock();
    assert(block);

    if (this._argv.blockNumber) {
      if (this._argv.blockNumber > block.blockNumber) {
        throw new Error(`Export snapshot block height ${this._argv.blockNumber} should be less than latest state indexed block height ${block.blockNumber}`);
      }

      const blocksAtSnapshotHeight = await indexer.getBlocksAtHeight(this._argv.blockNumber, false);

      if (!blocksAtSnapshotHeight.length) {
        throw new Error(`No blocks at snapshot height ${this._argv.blockNumber}`);
      }

      block = blocksAtSnapshotHeight[0];
    }

    log(`Creating export snapshot at block height ${block.blockNumber}`);

    // Export snapshot block.
    exportData.snapshotBlock = {
      blockNumber: block.blockNumber,
      blockHash: block.blockHash
    };

    // Export contracts and checkpoints.
    for (const contract of contracts) {
      if (contract.startingBlock > block.blockNumber) {
        continue;
      }

      exportData.contracts.push({
        address: contract.address,
        kind: contract.kind,
        checkpoint: contract.checkpoint,
        startingBlock: block.blockNumber
      });

      // Create and export checkpoint if checkpointing is on for the contract.
      if (contract.checkpoint) {
        await indexer.createCheckpoint(contract.address, block.blockHash);

        const state = await indexer.getLatestState(contract.address, StateKind.Checkpoint, block.blockNumber);
        assert(state);

        const data = indexer.getStateData(state);

        exportData.stateCheckpoints.push({
          contractAddress: state.contractAddress,
          cid: state.cid,
          kind: state.kind,
          data
        });
      }
    }

    if (this._argv.exportFile) {
      const codec = await import('@ipld/dag-cbor');
      const encodedExportData = codec.encode(exportData);

      const filePath = path.resolve(this._argv.exportFile);
      const fileDir = path.dirname(filePath);

      if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

      fs.writeFileSync(filePath, encodedExportData);
    } else {
      log(exportData);
    }

    log(`Export completed at height ${block.blockNumber}`);
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
      exportFile: {
        alias: 'o',
        type: 'string',
        describe: 'Export file path'
      },
      blockNumber: {
        type: 'number',
        describe: 'Block number to create snapshot at'
      }
    }).argv;
  }
}
