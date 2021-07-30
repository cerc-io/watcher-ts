import assert from 'assert';
import yargs from 'yargs';
import 'reflect-metadata';

import { Config, getConfig } from '@vulcanize/util';

import { Database } from '../database';
import { watchContract } from '../utils/index';

(async () => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'configuration file path (toml)'
    },
    address: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Address of the deployed contract'
    },
    kind: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Kind of contract (factory|pool|nfpm)'
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

  await watchContract(db, argv.address, argv.kind, argv.startingBlock);

  await db.close();
})();
