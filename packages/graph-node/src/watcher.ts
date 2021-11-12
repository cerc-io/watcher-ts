//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';
import path from 'path';
import fs from 'fs';
import { ContractInterface, utils } from 'ethers';

import { ResultObject } from '@vulcanize/assemblyscript/lib/loader';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { IndexerInterface } from '@vulcanize/util';

import { createEvent, getSubgraphConfig } from './utils';
import { Context, instantiate } from './loader';
import { Database } from './database';

const log = debug('vulcanize:graph-watcher');

interface DataSource {
  instance: ResultObject & { exports: any },
  contractInterface: utils.Interface
}

export class GraphWatcher {
  _database: Database;
  _indexer?: IndexerInterface;
  _postgraphileClient: EthClient;
  _subgraphPath: string;
  _dataSources: any[] = [];
  _dataSourceMap: { [key: string]: DataSource } = {};

  _context: Context = {
    event: {}
  }

  constructor (database: Database, postgraphileClient: EthClient, subgraphPath: string) {
    this._database = database;
    this._postgraphileClient = postgraphileClient;
    this._subgraphPath = subgraphPath;
  }

  async init () {
    const { dataSources } = await getSubgraphConfig(this._subgraphPath);
    this._dataSources = dataSources;

    // Create wasm instance and contract interface for each dataSource in subgraph yaml.
    const dataPromises = this._dataSources.map(async (dataSource: any) => {
      const { source: { address, abi }, mapping } = dataSource;
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
          address
        }
      };

      const filePath = path.join(this._subgraphPath, file);

      assert(this._indexer);

      return {
        instance: await instantiate(this._database, this._indexer, this._context, filePath, data),
        contractInterface
      };
    }, {});

    const data = await Promise.all(dataPromises);

    // Create a map from dataSource contract address to instance and contract interface.
    this._dataSourceMap = this._dataSources.reduce((acc: { [key: string]: DataSource }, dataSource: any, index: number) => {
      const { instance } = data[index];

      // Important to call _start for built subgraphs on instantiation!
      // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
      instance.exports._start();

      const { source: { address } } = dataSource;
      acc[address] = data[index];

      return acc;
    }, {});
  }

  async handleEvent (eventData: any) {
    const { contract, event, eventSignature, block, tx, eventIndex } = eventData;

    const {
      allEthHeaderCids: {
        nodes: [
          blockData
        ]
      }
    } = await this._postgraphileClient.getBlocks({ blockHash: block.hash });

    this._context.event.block = blockData;
    this._context.event.contract = contract;

    // Get dataSource in subgraph yaml based on contract address.
    const dataSource = this._dataSources.find(dataSource => dataSource.source.address === contract);

    if (!dataSource) {
      log(`Subgraph doesnt have configuration for contract ${contract}`);
      return;
    }

    // Get event handler based on event signature.
    const eventHandler = dataSource.mapping.eventHandlers.find((eventHandler: any) => eventHandler.event === eventSignature);

    if (!eventHandler) {
      log(`No handler configured in subgraph for event ${eventSignature}`);
      return;
    }

    const { instance: { exports }, contractInterface } = this._dataSourceMap[contract];

    const eventFragment = contractInterface.getEvent(eventSignature);

    const eventParams = eventFragment.inputs.map((input) => {
      return {
        name: input.name,
        value: event[input.name],
        kind: input.type
      };
    });

    const data = {
      eventParams: eventParams,
      block: blockData,
      tx,
      eventIndex
    };

    // Create ethereum event to be passed to the wasm event handler.
    const ethereumEvent = await createEvent(exports, contract, data);

    await exports[eventHandler.handler](ethereumEvent);
  }

  setIndexer (indexer: IndexerInterface): void {
    this._indexer = indexer;
  }

  async getEntity<Entity> (entity: new () => Entity, id: string, blockHash: string): Promise<Entity | undefined> {
    return this._database.getEntity(entity, id, blockHash);
  }
}
