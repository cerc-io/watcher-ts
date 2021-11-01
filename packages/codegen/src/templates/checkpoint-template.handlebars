//
// Copyright 2021 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';

import { Config, DEFAULT_CONFIG_PATH, getConfig, initClients } from '@vulcanize/util';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:checkpoint');

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
      describe: 'Contract address to create the checkpoint for.'
    },
    blockHash: {
      type: 'string',
      describe: 'Blockhash at which to create the checkpoint.'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, postgraphileClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const indexer = new Indexer(config.server, db, ethClient, postgraphileClient, ethProvider);
  const blockHash = await indexer.processCLICheckpoint(argv.address, argv.blockHash);

  log(`Created a checkpoint for contract ${argv.address} at block-hash ${blockHash}`);

  await db.close();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
