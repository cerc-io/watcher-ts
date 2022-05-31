//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import assert from 'assert';

import { Config, DEFAULT_CONFIG_PATH, getConfig, initClients, JobQueue } from '@vulcanize/util';
import { GraphWatcher, Database as GraphDatabase } from '@vulcanize/graph-node';

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
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, 'entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, ethClient, ethProvider, config.server);

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue, graphWatcher);
  await indexer.init();

  graphWatcher.setIndexer(indexer);
  await graphWatcher.init();

  const blockHash = await indexer.processCLICheckpoint(argv.address, argv.blockHash);

  log(`Created a checkpoint for contract ${argv.address} at block-hash ${blockHash}`);

  await db.close();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
