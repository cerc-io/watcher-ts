//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';

import { compareQuery, Config, getClients, getConfig } from './utils';

const log = debug('vulcanize:compare-blocks');

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
    startBlock: {
      type: 'number',
      demandOption: true,
      describe: 'Start block number'
    },
    endBlock: {
      type: 'number',
      demandOption: true,
      describe: 'End block number'
    },
    rawJson: {
      alias: 'j',
      type: 'boolean',
      describe: 'Whether to print out raw diff object',
      default: false
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);

  const { startBlock, endBlock, rawJson, queryDir } = argv;
  const queryNames = config.queries.names;
  let diffFound = false;

  const clients = await getClients(config, queryDir);

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    const block = { number: blockNumber };
    console.time(`time:compare-block-${blockNumber}`);

    for (const queryName of queryNames) {
      try {
        log(`At block ${blockNumber} for query ${queryName}:`);
        const resultDiff = await compareQuery(clients, queryName, { block }, rawJson);

        if (resultDiff) {
          diffFound = true;
          log('Results mismatch:', resultDiff);
        } else {
          log('Results match.');
        }
      } catch (err: any) {
        log('Error:', err.message);
      }
    }

    console.timeEnd(`time:compare-block-${blockNumber}`);
  }

  if (diffFound) {
    process.exit(1);
  }
};
