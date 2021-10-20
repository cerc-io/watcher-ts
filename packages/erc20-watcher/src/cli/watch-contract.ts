//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import yargs from 'yargs';
import 'reflect-metadata';
import { ethers } from 'ethers';

import { Config, DEFAULT_CONFIG_PATH, getConfig } from '@vulcanize/util';

import { Database } from '../database';

(async () => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'f',
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
    },
    address: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Address of the deployed contract'
    },
    checkpoint: {
      type: 'boolean',
      default: false,
      describe: 'Turn checkpointing on'
    },
    startingBlock: {
      type: 'number',
      default: 1,
      describe: 'Starting block'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { database: dbConfig } = config;

  assert(dbConfig);

  const db = new Database(dbConfig);
  await db.init();

  // Always use the checksum address (https://docs.ethers.io/v5/api/utils/address/#utils-getAddress).
  const address = ethers.utils.getAddress(argv.address);

  await db.saveContract(address, argv.checkpoint, argv.startingBlock);
  await db.close();
})();
