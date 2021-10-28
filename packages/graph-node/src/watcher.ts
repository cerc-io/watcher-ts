//
// Copyright 2021 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import path from 'path';
import fs from 'fs';
import { ContractInterface } from 'ethers';

import { Client } from './client';
import { createEvent, getSubgraphConfig } from './utils';
import { instantiate } from './index';

const log = debug('vulcanize:watcher');

const main = async () => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    url: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'URL of the watcher'
    },
    subgraph: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Path to subgraph build'
    }
  }).argv;

  const { subgraph: subgraphPath, url: watcherUrl } = argv;

  const client = new Client({
    gqlEndpoint: watcherUrl,
    gqlSubscriptionEndpoint: watcherUrl
  });

  const { dataSources } = await getSubgraphConfig(subgraphPath);

  const watcherPromises = dataSources.map(async (dataSource: any) => {
    const { source: { address }, mapping } = dataSource;
    const { abis, file, eventHandlers } = mapping;

    const data = {
      abis: abis.reduce((acc: {[key: string]: ContractInterface}, abi: any) => {
        const { name, file } = abi;
        const abiFilePath = path.join(subgraphPath, file);
        acc[name] = JSON.parse(fs.readFileSync(abiFilePath).toString());
        return acc;
      }, {}),
      dataSource: {
        address
      }
    };

    const filePath = path.join(subgraphPath, file);
    const { exports } = await instantiate(filePath, data);

    return client.watchEvents(async value => {
      const { onEvent: { contract, event } } = value;

      if (contract === address) {
        // TODO: Call instance methods based on event signature.
        // value should contain event signature.

        const [{ handler }] = eventHandlers;

        // Create ethereum event to be passed to handler.
        // TODO: Create ethereum event to be passed to handler.
        const ethereumEvent = await createEvent(exports, address, event);

        await exports[handler]()
      }
    });
  });

  await Promise.all(watcherPromises);
};

main().catch(error => {
  log(error);
  process.exit();
});
