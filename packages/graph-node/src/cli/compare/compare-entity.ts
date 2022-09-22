//
// Copyright 2021 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';

import { compareQuery, Config, getClients, getConfig } from './utils';

const log = debug('vulcanize:compare-entity');

export const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).env(
    'COMPARE'
  ).options({
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
    },
    timeDiff: {
      type: 'boolean',
      describe: 'Compare time taken between GQL queries',
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

  const clients = await getClients(config, argv.timeDiff, argv.queryDir);

  const { diff } = await compareQuery(clients, queryName, { id, block }, argv.rawJson, argv.timeDiff);

  if (diff) {
    log(diff);
    process.exit(1);
  }
};
