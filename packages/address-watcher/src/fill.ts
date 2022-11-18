//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { getCache } from '@cerc-io/cache';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { Config, DEFAULT_CONFIG_PATH, getConfig, JobQueue } from '@cerc-io/util';

import { Database } from './database';
import { QUEUE_TX_TRACING } from './tx-watcher';

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
      describe: 'configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
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

  const config = await getConfig<Config>(argv.configFile);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { ethServer: { gqlApiEndpoint }, traceProviderEndpoint, cache: cacheConfig } = upstream;
  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(traceProviderEndpoint, 'Missing upstream traceProviderEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    cache
  });

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  for (let blockNumber = argv.startBlock; blockNumber <= argv.endBlock; blockNumber++) {
    log(`Fill block ${blockNumber}`);

    // TODO: Add pause between requests so as to not overwhelm the upsteam server.
    const result = await ethClient.getBlockWithTransactions({ blockNumber });
    const { allEthHeaderCids: { nodes: blockNodes } } = result;
    for (let bi = 0; bi < blockNodes.length; bi++) {
      const { blockHash, ethTransactionCidsByHeaderId: { nodes: txNodes } } = blockNodes[bi];
      const blockProgress = await db.getBlockProgress(blockHash);
      if (blockProgress) {
        log(`Block number ${blockNumber}, block hash ${blockHash} already known, skip filling`);
      } else {
        await db.initBlockProgress(blockHash, blockNumber, txNodes.length);

        for (let ti = 0; ti < txNodes.length; ti++) {
          const { txHash } = txNodes[ti];
          log(`Filling block number ${blockNumber}, block hash ${blockHash}, tx hash ${txHash}`);

          // Never push appearances from fill jobs to GQL subscribers, as this command can be run multiple times
          // for the same block range, and/or process the same block in multiple different runs spread over a
          // period of time. Also, the tx's are probably too old anyway for publishing.
          await jobQueue.pushJob(QUEUE_TX_TRACING, { txHash, blockHash, publish: false, publishBlockProgress: true });
        }
      }
    }
  }
};

main().then(() => {
  process.exit();
}).catch(err => {
  log(err);
});
