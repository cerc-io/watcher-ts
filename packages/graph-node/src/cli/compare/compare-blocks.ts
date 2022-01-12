//
// Copyright 2022 Vulcanize, Inc.
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

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    const block = { number: blockNumber };

    for (const queryName of queryNames) {
      try {
        console.log(`At block ${blockNumber} for query ${queryName}:`);
        const resultDiff = await compareQuery(config, queryName, { block }, rawJson, queryDir);

        if (resultDiff) {
          diffFound = true;
          console.log(resultDiff);
        } else {
          console.log('Results match.');
        }
      } catch (err: any) {
        console.log('Error:', err.message);
      }
    }
  }

  if (diffFound) {
    process.exit(1);
  }
};
