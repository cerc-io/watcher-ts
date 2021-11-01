//
// Copyright 2021 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';

import { Config, DEFAULT_CONFIG_PATH, getConfig, initClients } from '@vulcanize/util';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:watch-contract');

const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'f',
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
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
      describe: 'Kind of contract'
    },
    checkpoint: {
      type: 'boolean',
      require: true,
      demandOption: true,
      describe: 'Turn checkpointing on'
    },
    startingBlock: {
      type: 'number',
      describe: 'Starting block'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, postgraphileClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const indexer = new Indexer(config.server, db, ethClient, postgraphileClient, ethProvider);
  await indexer.watchContract(argv.address, argv.kind, argv.checkpoint, argv.startingBlock);

  await db.close();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
