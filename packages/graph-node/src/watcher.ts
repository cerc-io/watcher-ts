//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';
import path from 'path';
import fs from 'fs';
import { ContractInterface, utils, providers } from 'ethers';
import { SelectionNode } from 'graphql';

import { ResultObject } from '@cerc-io/assemblyscript/lib/loader';
import {
  getFullBlock,
  BlockHeight,
  ServerConfig,
  getFullTransaction,
  QueryOptions,
  IndexerInterface,
  BlockProgressInterface,
  Database as BaseDatabase,
  GraphDatabase,
  resolveEntityFieldConflicts,
  createBlock,
  createEvent,
  getSubgraphConfig,
  Transaction,
  EthClient,
  DEFAULT_LIMIT,
  FILTER_CHANGE_BLOCK,
  Where,
  Filter,
  OPERATOR_MAP
} from '@cerc-io/util';

import { Context, GraphData, instantiate } from './loader';
import { ObjectLiteral } from 'typeorm';

const log = debug('vulcanize:graph-watcher');

interface DataSource {
  instance?: ResultObject & { exports: any },
  contractInterface: utils.Interface,
  data: GraphData,
}

export class GraphWatcher {
  _database: GraphDatabase;
  _indexer?: IndexerInterface;
  _ethClient: EthClient;
  _ethProvider: providers.BaseProvider;
  _subgraphPath: string;
  _wasmRestartBlocksInterval: number;
  _dataSources: any[] = [];
  _dataSourceMap: { [key: string]: DataSource } = {};
  _transactionsMap: Map<string, Transaction> = new Map();

  _context: Context;

  constructor (database: GraphDatabase, ethClient: EthClient, ethProvider: providers.BaseProvider, serverConfig: ServerConfig) {
    this._database = database;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._subgraphPath = serverConfig.subgraphPath;
    this._wasmRestartBlocksInterval = serverConfig.wasmRestartBlocksInterval;

    this._context = {
      rpcSupportsBlockHashParam: Boolean(serverConfig.rpcSupportsBlockHashParam)
    };
  }

  async init () {
    const { dataSources, templates = [] } = await getSubgraphConfig(this._subgraphPath);
    this._dataSources = dataSources.concat(templates);

    // Create wasm instance and contract interface for each dataSource and template in subgraph yaml.
    const dataPromises = this._dataSources.map(async (dataSource: any) => {
      const { source: { abi }, mapping, network, name } = dataSource;
      const { abis, file } = mapping;

      const abisMap = abis.reduce((acc: {[key: string]: ContractInterface}, abi: any) => {
        const { name, file } = abi;
        const abiFilePath = path.join(this._subgraphPath, file);
        acc[name] = JSON.parse(fs.readFileSync(abiFilePath).toString());

        return acc;
      }, {});

      const contractInterface = new utils.Interface(abisMap[abi]);

      const data = {
        abis: abisMap,
        dataSource: {
          network,
          name
        }
      };

      const filePath = path.join(this._subgraphPath, file);

      assert(this._indexer);

      return {
        instance: await instantiate(this._database, this._indexer, this._ethProvider, this._context, filePath, data),
        contractInterface,
        data
      };
    }, {});

    const data = await Promise.all(dataPromises);

    // Create a map from dataSource contract address to instance and contract interface.
    this._dataSourceMap = this._dataSources.reduce((acc: { [key: string]: DataSource }, dataSource: any, index: number) => {
      const { instance } = data[index];

      // Important to call _start for built subgraphs on instantiation!
      // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
      instance.exports._start();

      const { name } = dataSource;
      acc[name] = data[index];

      return acc;
    }, {});
  }

  get dataSources (): any[] {
    return this._dataSources;
  }

  async addContracts () {
    assert(this._indexer);
    assert(this._indexer.watchContract);
    assert(this._indexer.isWatchedContract);

    // Watching the contract(s) if not watched already.
    for (const dataSource of this._dataSources) {
      const { source: { address, startBlock }, name } = dataSource;

      // Skip for templates as they are added dynamically.
      if (address) {
        const watchedContract = await this._indexer.isWatchedContract(address);

        if (!watchedContract) {
          await this._indexer.watchContract(address, name, true, startBlock);
        }
      }
    }
  }

  async handleEvent (eventData: any) {
    const { contract, event, eventSignature, block, tx: { hash: txHash }, eventIndex } = eventData;

    // Check if block data is already fetched by a previous event in the same block.
    if (!this._context.block || this._context.block.blockHash !== block.hash) {
      console.time(`time:graph-watcher#handleEvent-getFullBlock-block-${block.number}`);
      this._context.block = await getFullBlock(this._ethClient, this._ethProvider, block.hash, block.number);
      console.timeEnd(`time:graph-watcher#handleEvent-getFullBlock-block-${block.number}`);
    }

    const blockData = this._context.block;
    assert(blockData);

    assert(this._indexer && this._indexer.isWatchedContract);
    const watchedContract = this._indexer.isWatchedContract(contract);
    assert(watchedContract);

    // Get dataSource in subgraph yaml based on contract address.
    const dataSource = this._dataSources.find(dataSource => dataSource.name === watchedContract.kind);

    if (!dataSource) {
      log(`Subgraph doesn't have configuration for contract ${contract}`);
      return;
    }

    this._context.contractAddress = contract;

    const { instance, contractInterface } = this._dataSourceMap[watchedContract.kind];
    assert(instance);
    const { exports: instanceExports } = instance;

    // Get event handler based on event topic (from event signature).
    const eventTopic = contractInterface.getEventTopic(eventSignature);
    const eventHandler = dataSource.mapping.eventHandlers.find((eventHandler: any) => {
      // The event signature we get from logDescription is different than that given in the subgraph yaml file.
      // For eg. event in subgraph.yaml: Stake(indexed address,uint256); from logDescription: Stake(address,uint256)
      // ethers.js doesn't recognize the subgraph event signature with indexed keyword before param type.
      // Match event topics from cleaned subgraph event signature (Stake(indexed address,uint256) -> Stake(address,uint256)).
      const subgraphEventTopic = contractInterface.getEventTopic(eventHandler.event.replace(/indexed /g, ''));

      return subgraphEventTopic === eventTopic;
    });

    if (!eventHandler) {
      log(`No handler configured in subgraph for event ${eventSignature}`);
      return;
    }

    const eventFragment = contractInterface.getEvent(eventSignature);

    const tx = await this._getTransactionData(txHash, Number(blockData.blockNumber));

    const data = {
      block: blockData,
      inputs: eventFragment.inputs,
      event,
      tx,
      eventIndex
    };

    // Create ethereum event to be passed to the wasm event handler.
    console.time(`time:graph-watcher#handleEvent-createEvent-block-${block.number}-event-${eventSignature}`);
    const ethereumEvent = await createEvent(instanceExports, contract, data);
    console.timeEnd(`time:graph-watcher#handleEvent-createEvent-block-${block.number}-event-${eventSignature}`);
    try {
      console.time(`time:graph-watcher#handleEvent-exec-${dataSource.name}-event-handler-${eventSignature}`);
      await this._handleMemoryError(instanceExports[eventHandler.handler](ethereumEvent), dataSource.name);
      console.timeEnd(`time:graph-watcher#handleEvent-exec-${dataSource.name}-event-handler-${eventSignature}`);
    } catch (error) {
      this._clearCachedEntities();
      throw error;
    }
  }

  async handleBlock (blockHash: string, blockNumber: number) {
    // Clear transactions map on handling new block.
    this._transactionsMap.clear();

    // Call block handler(s) for each contract.
    for (const dataSource of this._dataSources) {
      // Reinstantiate WASM after every N blocks.
      if (Number(blockNumber) % this._wasmRestartBlocksInterval === 0) {
        // The WASM instance allocates memory as required and the limit is 4GB.
        // https://stackoverflow.com/a/40453962
        // https://github.com/AssemblyScript/assemblyscript/pull/1268#issue-618411291
        // https://github.com/WebAssembly/memory64/blob/main/proposals/memory64/Overview.md#motivation
        await this._reInitWasm(dataSource.name);
      }

      // Check if block handler(s) are configured.
      if (!dataSource.mapping.blockHandlers) {
        continue;
      }

      // Check if block data is already fetched in handleEvent method for the same block.
      if (!this._context.block || this._context.block.blockHash !== blockHash) {
        this._context.block = await getFullBlock(this._ethClient, this._ethProvider, blockHash, blockNumber);
      }

      const blockData = this._context.block;
      assert(blockData);

      const { instance } = this._dataSourceMap[dataSource.name];
      assert(instance);
      const { exports: instanceExports } = instance;

      // Create ethereum block to be passed to a wasm block handler.
      const ethereumBlock = await createBlock(instanceExports, blockData);

      let contractAddressList: string[] = [];

      if (dataSource.source.address) {
        // Check if start block has been reached.
        if (blockData.blockNumber >= dataSource.source.startBlock) {
          contractAddressList.push(dataSource.source.address);
        }
      } else {
        // Data source templates will have multiple watched contracts.
        assert(this._indexer?.getContractsByKind);
        const watchedContracts = this._indexer.getContractsByKind(dataSource.name);

        contractAddressList = watchedContracts.filter(contract => Number(blockData.blockNumber) >= contract.startingBlock)
          .map(contract => contract.address);
      }

      for (const contractAddress of contractAddressList) {
        this._context.contractAddress = contractAddress;

        // Call all the block handlers one after another for a contract.
        const blockHandlerPromises = dataSource.mapping.blockHandlers.map(async (blockHandler: any): Promise<void> => {
          await instanceExports[blockHandler.handler](ethereumBlock);
        });

        try {
          await this._handleMemoryError(Promise.all(blockHandlerPromises), dataSource.name);
        } catch (error) {
          this._clearCachedEntities();
          throw error;
        }
      }
    }
  }

  setIndexer (indexer: IndexerInterface): void {
    this._indexer = indexer;
  }

  async getEntity<Entity extends ObjectLiteral> (
    entity: new () => Entity,
    id: string,
    relationsMap: Map<any, { [key: string]: any }>,
    block: BlockHeight,
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<any> {
    const dbTx = await this._database.createTransactionRunner();

    try {
      // Get entity from the database.
      const result = await this._database.getEntityWithRelations(dbTx, entity, id, relationsMap, block, selections);
      await dbTx.commitTransaction();

      // Resolve any field name conflicts in the entity result.
      return resolveEntityFieldConflicts(result);
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async getEntities<Entity extends ObjectLiteral> (
    entity: new () => Entity,
    relationsMap: Map<any, { [key: string]: any }>,
    block: BlockHeight,
    where: { [key: string]: any } = {},
    queryOptions: QueryOptions,
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<any> {
    const dbTx = await this._database.createTransactionRunner();

    try {
      where = this._buildFilter(where);

      if (!queryOptions.limit) {
        queryOptions.limit = DEFAULT_LIMIT;
      }

      // Get entities from the database.
      const entities = await this._database.getEntities(dbTx, entity, relationsMap, block, where, queryOptions, selections);
      await dbTx.commitTransaction();

      return entities;
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  updateEntityCacheFrothyBlocks (blockProgress: BlockProgressInterface): void {
    assert(this._indexer);
    this._database.updateEntityCacheFrothyBlocks(blockProgress, this._indexer.serverConfig.clearEntitiesCacheInterval);
  }

  async pruneEntities (frothyEntityType: new () => any, prunedBlocks: BlockProgressInterface[], entityTypes: Set<new () => any>) {
    const dbTx = await this._database.createTransactionRunner();

    try {
      await this._database.pruneEntities(frothyEntityType, dbTx, prunedBlocks, entityTypes);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async pruneFrothyEntities<Entity> (frothyEntityType: new () => Entity, blockNumber: number): Promise<void> {
    const dbTx = await this._database.createTransactionRunner();
    try {
      await this._database.pruneFrothyEntities(dbTx, frothyEntityType, blockNumber);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async resetLatestEntities (blockNumber: number): Promise<void> {
    const dbTx = await this._database.createTransactionRunner();
    try {
      await this._database.resetLatestEntities(dbTx, blockNumber);

      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  pruneEntityCacheFrothyBlocks (canonicalBlockHash: string, canonicalBlockNumber: number) {
    this._database.pruneEntityCacheFrothyBlocks(canonicalBlockHash, canonicalBlockNumber);
  }

  _clearCachedEntities () {
    this._database.cachedEntities.frothyBlocks.clear();
    this._database.cachedEntities.latestPrunedEntities.clear();
  }

  /**
   * Method to reinstantiate WASM instance for specified dataSource.
   * @param dataSourceName
   */
  async _reInitWasm (dataSourceName: string): Promise<void> {
    const { data, instance } = this._dataSourceMap[dataSourceName];

    assert(instance);
    const { module } = instance;
    delete this._dataSourceMap[dataSourceName].instance;

    assert(this._indexer);

    // Reinstantiate with existing module.
    this._dataSourceMap[dataSourceName].instance = await instantiate(
      this._database,
      this._indexer,
      this._ethProvider,
      this._context,
      module,
      data
    );

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this._dataSourceMap[dataSourceName].instance!.exports._start();
  }

  async _handleMemoryError (handlerPromise: Promise<any>, dataSourceName: string): Promise<void> {
    try {
      await handlerPromise;
    } catch (error) {
      if (error instanceof WebAssembly.RuntimeError && error instanceof Error) {
        if (error.message === 'unreachable') {
          // Reintantiate WASM for out of memory error.
          this._reInitWasm(dataSourceName);
        }
      }

      // Job will retry after throwing error.
      throw error;
    }
  }

  async _getTransactionData (txHash: string, blockNumber: number): Promise<Transaction> {
    let transaction = this._transactionsMap.get(txHash);

    if (transaction) {
      return transaction;
    }

    console.time(`time:graph-watcher#_getTransactionData-getFullTransaction-block-${blockNumber}-tx-${txHash}`);
    transaction = await getFullTransaction(this._ethClient, txHash, blockNumber);
    console.timeEnd(`time:graph-watcher#_getTransactionData-getFullTransaction-block-${blockNumber}-tx-${txHash}`);
    assert(transaction);
    this._transactionsMap.set(txHash, transaction);

    return transaction;
  }

  _buildFilter (where: { [key: string]: any } = {}): Where {
    return Object.entries(where).reduce((acc: Where, [fieldWithSuffix, value]) => {
      if (fieldWithSuffix === FILTER_CHANGE_BLOCK) {
        assert(value.number_gte && typeof value.number_gte === 'number');

        acc[FILTER_CHANGE_BLOCK] = [{
          value: value.number_gte,
          not: false
        }];

        return acc;
      }

      if (['and', 'or'].includes(fieldWithSuffix)) {
        assert(Array.isArray(value));

        // Parse all the comibations given in the array
        acc[fieldWithSuffix] = value.map(w => {
          return this._buildFilter(w);
        });

        return acc;
      }

      const [field, ...suffix] = fieldWithSuffix.split('_');

      if (!acc[field]) {
        acc[field] = [];
      }

      let op = suffix.shift();

      // If op is "" (different from undefined), it means it's a nested filter on a relation field
      if (op === '') {
        (acc[field] as Filter[]).push({
          // Parse nested filter value
          value: this._buildFilter(value),
          not: false,
          operator: 'nested'
        });

        return acc;
      }

      const filter: Filter = {
        value,
        not: false,
        operator: 'equals'
      };

      if (op === 'not') {
        filter.not = true;
        op = suffix.shift();
      }

      if (op) {
        filter.operator = op as keyof typeof OPERATOR_MAP;
      }

      // If filter field ends with "nocase", use case insensitive version of the operator
      if (suffix[suffix.length - 1] === 'nocase') {
        filter.operator = `${op}_nocase` as keyof typeof OPERATOR_MAP;
      }

      (acc[field] as Filter[]).push(filter);

      return acc;
    }, {});
  }
}

export const getGraphDbAndWatcher = async (
  serverConfig: ServerConfig,
  ethClient: EthClient,
  ethProvider: providers.BaseProvider,
  baseDatabase: BaseDatabase,
  entityQueryTypeMap?: Map<any, any>,
  entityToLatestEntityMap?: Map<any, any>
): Promise<{ graphDb: GraphDatabase, graphWatcher: GraphWatcher }> => {
  const graphDb = new GraphDatabase(serverConfig, baseDatabase, entityQueryTypeMap, entityToLatestEntityMap);
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, ethClient, ethProvider, serverConfig);

  return {
    graphDb,
    graphWatcher
  };
};
