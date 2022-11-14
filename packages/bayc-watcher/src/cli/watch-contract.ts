//
// Copyright 2021 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import assert from 'assert';

import { Config, DEFAULT_CONFIG_PATH, getConfig, initClients, JobQueue } from '@cerc-io/util';

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
      default: 1,
      describe: 'Starting block'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue);
  await indexer.init();

  await indexer.watchContract(argv.address, argv.kind, argv.checkpoint, argv.startingBlock);

  await db.close();
  await jobQueue.stop();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
