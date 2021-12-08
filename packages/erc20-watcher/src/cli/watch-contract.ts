//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import yargs from 'yargs';
import 'reflect-metadata';

import { Config, DEFAULT_CONFIG_PATH, getConfig, getResetConfig, JobQueue } from '@vulcanize/util';

import { Database } from '../database';
import { Indexer } from '../indexer';

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
    startingBlock: {
      type: 'number',
      default: 1,
      describe: 'Starting block'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { database: dbConfig, server: { mode }, jobQueue: jobQueueConfig } = config;
  const { ethClient, postgraphileClient, ethProvider } = await getResetConfig(config);

  assert(dbConfig);

  const db = new Database(dbConfig);
  await db.init();

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(db, ethClient, postgraphileClient, ethProvider, jobQueue, mode);

  await indexer.watchContract(argv.address, argv.startingBlock);

  await db.close();
  await jobQueue.stop();
  process.exit();
})();
