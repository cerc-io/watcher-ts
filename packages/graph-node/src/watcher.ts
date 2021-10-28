//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';
import path from 'path';
import fs from 'fs';
import { ContractInterface } from 'ethers';

import { getSubgraphConfig } from './utils';
import { instantiate } from './loader';
import { ResultObject } from '@vulcanize/assemblyscript/lib/loader';

const log = debug('vulcanize:graph-watcher');

export class GraphWatcher {
  _subgraphPath: string;
  _dataSources: any[] = []
  _instanceMap: { [key: string]: ResultObject & { exports: any } } = {};

  constructor (subgraphPath: string) {
    this._subgraphPath = subgraphPath;
  }

  async init () {
    const { dataSources } = await getSubgraphConfig(this._subgraphPath);
    this._dataSources = dataSources;

    this._instanceMap = this._dataSources.reduce(async (acc: { [key: string]: ResultObject & { exports: any } }, dataSource: any) => {
      const { source: { address }, mapping } = dataSource;
      const { abis, file } = mapping;

      const data = {
        abis: abis.reduce((acc: {[key: string]: ContractInterface}, abi: any) => {
          const { name, file } = abi;
          const abiFilePath = path.join(this._subgraphPath, file);
          acc[name] = JSON.parse(fs.readFileSync(abiFilePath).toString());
          return acc;
        }, {}),
        dataSource: {
          address
        }
      };

      const filePath = path.join(this._subgraphPath, file);
      const instance = await instantiate(filePath, data);

      acc[address] = instance;
      return acc;
    }, {});
  }

  async handleEvent (eventData: any) {
    const { contract } = eventData;

    const dataSource = this._dataSources.find(dataSource => dataSource.source.address === contract);

    if (!dataSource) {
      log(`Subgraph doesnt have configuration for contract ${contract}`);
      return;
    }

    // TODO: Call instance methods based on event signature.
    // value should contain event signature.

    const [{ handler }] = dataSource.mapping.eventHandlers;
    const { exports } = this._instanceMap[contract];

    // Create ethereum event to be passed to handler.
    // TODO: Create ethereum event to be passed to handler.
    // const ethereumEvent = await createEvent(exports, address, event);

    await exports[handler]();
  }
}
