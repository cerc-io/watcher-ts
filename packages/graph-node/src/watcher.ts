//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';
import path from 'path';
import fs from 'fs';
import { ContractInterface, utils, providers } from 'ethers';

import { ResultObject } from '@vulcanize/assemblyscript/lib/loader';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { IndexerInterface, getFullBlock, BlockHeight, ServerConfig, getFullTransaction } from '@vulcanize/util';

import { createBlock, createEvent, getSubgraphConfig, resolveEntityFieldConflicts, Transaction } from './utils';
import { Context, GraphData, instantiate } from './loader';
import { Database } from './database';

const log = debug('vulcanize:graph-watcher');

interface DataSource {
  instance?: ResultObject & { exports: any },
  contractInterface: utils.Interface,
  data: GraphData,
}

export class GraphWatcher {
  _database: Database;
  _indexer?: IndexerInterface;
  _postgraphileClient: EthClient;
  _ethProvider: providers.BaseProvider;
  _subgraphPath: string;
  _wasmRestartBlocksInterval: number;
  _dataSources: any[] = [];
  _dataSourceMap: { [key: string]: DataSource } = {};
  _transactionsMap: Map<string, Transaction> = new Map()

  _context: Context = {};

  constructor (database: Database, postgraphileClient: EthClient, ethProvider: providers.BaseProvider, serverConfig: ServerConfig) {
    this._database = database;
    this._postgraphileClient = postgraphileClient;
    this._ethProvider = ethProvider;
    this._subgraphPath = serverConfig.subgraphPath;
    this._wasmRestartBlocksInterval = serverConfig.wasmRestartBlocksInterval;
  }

  async init () {
    const { dataSources, templates = [] } = await getSubgraphConfig(this._subgraphPath);
    this._dataSources = dataSources.concat(templates);

    // Create wasm instance and contract interface for each dataSource and template in subgraph yaml.
    const dataPromises = this._dataSources.map(async (dataSource: any) => {
      const { source: { address, abi }, mapping, network } = dataSource;
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
          address,
          network
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

    if (!this._context.block) {
      this._context.block = await getFullBlock(this._postgraphileClient, this._ethProvider, block.hash);
    }

    const blockData = this._context.block;
    assert(blockData);

    assert(this._indexer && this._indexer.isWatchedContract);
    const watchedContract = await this._indexer.isWatchedContract(contract);
    assert(watchedContract);

    // Get dataSource in subgraph yaml based on contract address.
    const dataSource = this._dataSources.find(dataSource => dataSource.name === watchedContract.kind);

    if (!dataSource) {
      log(`Subgraph doesnt have configuration for contract ${contract}`);
      return;
    }

    this._context.event = {
      contract
    };

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

    const tx = await this._getTransactionData(blockData.headerId, txHash);

    const data = {
      block: blockData,
      inputs: eventFragment.inputs,
      event,
      tx,
      eventIndex
    };

    // Create ethereum event to be passed to the wasm event handler.
    const ethereumEvent = await createEvent(instanceExports, contract, data);

    await this._handleMemoryError(instanceExports[eventHandler.handler](ethereumEvent), dataSource.name);
  }

  async handleBlock (blockHash: string) {
    const blockData = await getFullBlock(this._postgraphileClient, this._ethProvider, blockHash);

    this._context.block = blockData;

    // Clear transactions map on handling new block.
    this._transactionsMap.clear();

    // Call block handler(s) for each contract.
    for (const dataSource of this._dataSources) {
      // Reinstantiate WASM after every N blocks.
      if (blockData.blockNumber % this._wasmRestartBlocksInterval === 0) {
        // The WASM instance allocates memory as required and the limit is 4GB.
        // https://stackoverflow.com/a/40453962
        // https://github.com/AssemblyScript/assemblyscript/pull/1268#issue-618411291
        // https://github.com/WebAssembly/memory64/blob/main/proposals/memory64/Overview.md#motivation
        await this._reInitWasm(dataSource.name);
      }

      // Check if block handler(s) are configured and start block has been reached.
      if (!dataSource.mapping.blockHandlers || blockData.blockNumber < dataSource.source.startBlock) {
        continue;
      }

      const { instance } = this._dataSourceMap[dataSource.name];
      assert(instance);
      const { exports: instanceExports } = instance;

      // Create ethereum block to be passed to a wasm block handler.
      const ethereumBlock = await createBlock(instanceExports, blockData);

      // Call all the block handlers one after the another for a contract.
      const blockHandlerPromises = dataSource.mapping.blockHandlers.map(async (blockHandler: any): Promise<void> => {
        await instanceExports[blockHandler.handler](ethereumBlock);
      });

      await this._handleMemoryError(Promise.all(blockHandlerPromises), dataSource.name);
    }
  }

  setIndexer (indexer: IndexerInterface): void {
    this._indexer = indexer;
  }

  async getEntity<Entity> (entity: new () => Entity, id: string, relations: { [key: string]: any }, block?: BlockHeight): Promise<any> {
    // Get entity from the database.
    const result = await this._database.getEntityWithRelations(entity, id, relations, block) as any;

    // Resolve any field name conflicts in the entity result.
    return resolveEntityFieldConflicts(result);
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

  async _getTransactionData (headerId: number, txHash: string): Promise<Transaction> {
    let transaction = this._transactionsMap.get(txHash);

    if (transaction) {
      return transaction;
    }

    transaction = await getFullTransaction(this._postgraphileClient, headerId, txHash);
    assert(transaction);
    this._transactionsMap.set(txHash, transaction);

    return transaction;
  }
}
