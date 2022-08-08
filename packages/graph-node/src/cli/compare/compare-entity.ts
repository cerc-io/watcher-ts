//
// Copyright 2021 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';

import { compareQuery, Config, getClients, getConfig } from './utils';

export const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'cf',
      type: 'string',
      demandOption: true,
      describe: 'Configuration file path (toml)'
    },
    queryDir: {
      alias: 'qf',
      type: 'string',
      describe: 'Path to queries directory'
    },
    blockHash: {
      alias: 'b',
      type: 'string',
      describe: 'Block hash'
    },
    blockNumber: {
      type: 'number',
      describe: 'Block number'
    },
    queryName: {
      alias: 'q',
      type: 'string',
      demandOption: true,
      describe: 'Query name'
    },
    entityId: {
      alias: 'i',
      type: 'string',
      describe: 'Id of the entity to be queried'
    },
    rawJson: {
      alias: 'j',
      type: 'boolean',
      describe: 'Whether to print out raw diff object',
      default: false
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);

  const queryName = argv.queryName;
  const id = argv.entityId;

  const block = {
    number: argv.blockNumber,
    hash: argv.blockHash
  };

  const clients = await getClients(config, argv.queryDir);

  const resultDiff = await compareQuery(clients, queryName, { id, block }, argv.rawJson);

  if (resultDiff) {
    console.log(resultDiff);
    process.exit(1);
  }
};
