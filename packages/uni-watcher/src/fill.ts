//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { getConfig, JobQueue } from '@vulcanize/util';

import { Database } from './database';
import { QUEUE_BLOCK_PROCESSING } from './events';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'f',
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'configuration file path (toml)'
    },
    startBlock: {
      type: 'number',
      require: true,
      demandOption: true,
      describe: 'Block number to start processing at'
    },
    endBlock: {
      type: 'number',
      require: true,
      demandOption: true,
      describe: 'Block number to stop processing at'
    }
  }).argv;

  const config = await getConfig(argv.configFile);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { ethServer: { gqlPostgraphileEndpoint }, cache: cacheConfig } = upstream;
  assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlPostgraphileEndpoint,
    gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLag } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag });
  await jobQueue.start();

  for (let blockNumber = argv.startBlock; blockNumber <= argv.endBlock; blockNumber++) {
    log(`Fill block ${blockNumber}`);

    // TODO: Add pause between requests so as to not overwhelm the upsteam server.
    const result = await ethClient.getBlockWithTransactions({ blockNumber });
    const { allEthHeaderCids: { nodes: blockNodes } } = result;
    for (let bi = 0; bi < blockNodes.length; bi++) {
      const { blockHash, blockNumber, parentHash } = blockNodes[bi];
      const blockProgress = await db.getBlockProgress(blockHash);
      if (blockProgress) {
        log(`Block number ${blockNumber}, block hash ${blockHash} already known, skip filling`);
      } else {
        await jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { blockHash, blockNumber, parentHash });
      }
    }
  }
};

main().then(() => {
  process.exit();
}).catch(err => {
  log(err);
});
