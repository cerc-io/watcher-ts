//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import util from 'util';

import { Config, DEFAULT_CONFIG_PATH, getConfig, initClients, JobQueue } from '@vulcanize/util';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:inspect-cid');

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
    cid: {
      alias: 'c',
      type: 'string',
      demandOption: true,
      describe: 'CID to be inspected'
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

  const ipldBlock = await indexer.getIPLDBlockByCid(argv.cid);
  assert(ipldBlock, 'IPLDBlock for the provided CID doesn\'t exist.');

  const ipldData = await indexer.getIPLDData(ipldBlock);

  log(util.inspect(ipldData, false, null));
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
