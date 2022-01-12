//
// Copyright 2021 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';

import { compareQuery, Config, getConfig } from './utils';

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
  const blockHash = argv.blockHash;

  const block = {
    number: argv.blockNumber,
    hash: blockHash
  };

  const resultDiff = await compareQuery(config, queryName, { id, block }, argv.rawJson, argv.queryDir);

  if (resultDiff) {
    console.log(resultDiff);
    process.exit(1);
  }
};
