//
// Copyright 2023 Vulcanize, Inc.
//

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import assert from 'assert';
import { ConnectionOptions } from 'typeorm';
import debug from 'debug';
import pluralize from 'pluralize';
import { merge } from 'lodash';
import path from 'path';
import fs from 'fs';
import { ethers } from 'ethers';

import { JsonRpcProvider } from '@ethersproject/providers';
import {
  DEFAULT_CONFIG_PATH,
  JobQueue,
  DatabaseInterface,
  IndexerInterface,
  ServerConfig,
  Clients,
  GraphWatcherInterface,
  Config,
  BlockProgressInterface,
  StateKind,
  createOrUpdateStateData,
  getContractEntitiesMap,
  prepareGQLEntityState
} from '@cerc-io/util';
import { GraphQLClient } from '@cerc-io/ipld-eth-client';

import { BaseCmd } from './base';

const log = debug('vulcanize:create-gql-state');

const ENTITIES_QUERY_LIMIT = 1000;

interface Arguments {
  configFile: string;
  snapshotBlockHash: string;
  output: string;
  gqlEndpoint: string;
}

export class CreateGQLStateCmd {
  _argv?: Arguments;
  _gqlClient?: GraphQLClient;
  _baseCmd: BaseCmd;
  _queries: { [key: string]: string };

  constructor (queries: { [key: string]: string }) {
    this._baseCmd = new BaseCmd();
    this._queries = queries;
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

  get indexer (): IndexerInterface {
    return this._baseCmd.indexer;
  }

  async initConfig<ConfigType> (): Promise<ConfigType> {
    this._argv = this._getArgv();
    assert(this._argv);
    this._gqlClient = new GraphQLClient({ gqlEndpoint: this._argv.gqlEndpoint });

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

  async exec (dataSources: any[]): Promise<void> {
    const indexer = this._baseCmd.indexer;
    const database = this._baseCmd.database;

    assert(indexer);
    assert(database);
    assert(this._argv);

    const [block] = await indexer.getBlocks({ blockHash: this._argv.snapshotBlockHash });

    if (!block) {
      log(`No blocks fetched for block hash ${this._argv.snapshotBlockHash}, use an existing block`);
      return;
    }

    const blockProgress: Partial<BlockProgressInterface> = {
      ...block,
      blockNumber: Number(block.blockNumber)
    };

    // Get watched contracts using subgraph dataSources
    const watchedContracts = dataSources.map(dataSource => {
      const { source: { address, startBlock }, name } = dataSource;

      return {
        address: ethers.utils.getAddress(address),
        kind: name,
        checkpoint: true,
        startingBlock: startBlock
      };
    });

    const exportData: any = {
      snapshotBlock: {
        blockNumber: blockProgress.blockNumber,
        blockHash: blockProgress.blockHash
      },
      contracts: watchedContracts,
      stateCheckpoints: []
    };

    // Get contractEntitiesMap
    // NOTE: Assuming each entity type is only mapped to a single contract
    // TODO: Decouple subgraph entities and contracts in watcher state
    const contractEntitiesMap = getContractEntitiesMap(dataSources);

    // Create state checkpoint for each contract in contractEntitiesMap
    const contractStatePromises = Array.from(contractEntitiesMap.entries())
      .map(async ([contractAddress, entities]): Promise<void> => {
        // Get all the updated entities at this block
        const updatedEntitiesListPromises = entities.map(async (entity): Promise<Array<{[key: string]: any}>> => {
          assert(this._argv);

          // Get entities for block from GQL query
          return this._getGQLEntitiesForSnapshotBlock(entity);
        });

        const updatedEntitiesList = await Promise.all(updatedEntitiesListPromises);

        let checkpointData = { state: {} };

        // Populate checkpoint state with all the updated entities of each entity type
        updatedEntitiesList.forEach((updatedEntities, index) => {
          const entityName = entities[index];

          updatedEntities.forEach((updatedEntity) => {
            assert(indexer.getRelationsMap);

            // Prepare diff data for the entity update
            const diffData = prepareGQLEntityState(updatedEntity, entityName, indexer.getRelationsMap());

            // Merge diffData for each entity
            checkpointData = merge(checkpointData, diffData);
          });
        });

        assert(blockProgress.cid);
        assert(blockProgress.blockNumber);

        const stateDataMeta = {
          id: contractAddress,
          kind: StateKind.Checkpoint,
          parent: {
            '/': null
          },
          ethBlock: {
            cid: {
              '/': blockProgress.cid
            },
            num: blockProgress.blockNumber
          }
        };

        const { cid, data } = await createOrUpdateStateData(
          checkpointData,
          stateDataMeta
        );

        assert(data.meta);

        exportData.stateCheckpoints.push({
          contractAddress,
          cid: cid.toString(),
          kind: data.meta.kind,
          data
        });
      });

    await Promise.all(contractStatePromises);

    if (this._argv.output) {
      const codec = await import('@ipld/dag-cbor');
      const encodedExportData = codec.encode(exportData);

      const filePath = path.resolve(this._argv.output);
      const fileDir = path.dirname(filePath);

      if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

      fs.writeFileSync(filePath, encodedExportData);
    } else {
      log(exportData);
    }

    log(`Snapshot checkpoint state created at height ${blockProgress.blockNumber}`);
    await database.close();
  }

  _getGQLEntitiesForSnapshotBlock = async (entityName: string): Promise<Array<{[key: string]: any}>> => {
    const queryName = pluralize(`${entityName.charAt(0).toLowerCase().concat(entityName.slice(1))}`);
    const gqlQuery = this._queries[queryName];

    assert(this._argv);
    assert(this._gqlClient);

    const block = {
      hash: this._argv.snapshotBlockHash
    };

    const { gql } = await import('@apollo/client/core/index.js');

    const data = await this._gqlClient.query(
      gql(gqlQuery),
      {
        block,
        first: ENTITIES_QUERY_LIMIT
      }
    );

    return data[queryName];
  };

  _getArgv (): any {
    return yargs(hideBin(process.argv))
      .option('configFile', {
        alias: 'f',
        demandOption: true,
        describe: 'configuration file path (toml)',
        type: 'string',
        default: DEFAULT_CONFIG_PATH
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        describe: 'Output file path of created checkpoint state'
      })
      .option('snapshotBlockHash', {
        type: 'string',
        describe: 'Block hash to create snapshot at'
      })
      .option('gqlEndpoint', {
        type: 'string',
        describe: 'GQL endpoint to fetch entities from'
      })
      .argv;
  }
}
