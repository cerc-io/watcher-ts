//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';
import fs from 'fs';
import path from 'path';

import { getConfig, fillBlocks, JobQueue, DEFAULT_CONFIG_PATH, Config, initClients, StateKind } from '@vulcanize/util';
import { GraphWatcher, Database as GraphDatabase } from '@vulcanize/graph-node';
import * as codec from '@ipld/dag-cbor';

import { Database } from '../database';
import { Indexer } from '../indexer';
import { EventWatcher } from '../events';
import { IPLDBlock } from '../entity/IPLDBlock';

const log = debug('vulcanize:import-state');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'f',
      type: 'string',
      demandOption: true,
      describe: 'configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
    },
    importFile: {
      alias: 'i',
      type: 'string',
      demandOption: true,
      describe: 'Import file path (JSON)'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, postgraphileClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, 'entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, postgraphileClient, ethProvider, config.server);

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, postgraphileClient, ethProvider, jobQueue, graphWatcher);
  await indexer.init();

  graphWatcher.setIndexer(indexer);
  await graphWatcher.init();

  const eventWatcher = new EventWatcher(config.upstream, ethClient, postgraphileClient, indexer, pubsub, jobQueue);

  // Import data.
  const importFilePath = path.resolve(argv.importFile);
  const encodedImportData = fs.readFileSync(importFilePath);
  const importData = codec.decode(Buffer.from(encodedImportData)) as any;

  // Fill the snapshot block.
  await fillBlocks(
    jobQueue,
    indexer,
    eventWatcher,
    config.upstream.ethServer.blockDelayInMilliSecs,
    {
      startBlock: importData.snapshotBlock.blockNumber,
      endBlock: importData.snapshotBlock.blockNumber
    }
  );

  // Fill the Contracts.
  for (const contract of importData.contracts) {
    await indexer.watchContract(contract.address, contract.kind, contract.checkpoint, contract.startingBlock);
  }

  // Get the snapshot block.
  const block = await indexer.getBlockProgress(importData.snapshotBlock.blockHash);
  assert(block);

  // Fill the IPLDBlocks.
  for (const checkpoint of importData.ipldCheckpoints) {
    let ipldBlock = new IPLDBlock();

    ipldBlock = Object.assign(ipldBlock, checkpoint);
    ipldBlock.block = block;

    ipldBlock.data = Buffer.from(codec.encode(ipldBlock.data));

    await indexer.saveOrUpdateIPLDBlock(ipldBlock);
  }

  // The 'diff_staged' and 'init' IPLD blocks are unnecessary as checkpoints have been already created for the snapshot block.
  await indexer.removeIPLDBlocks(block.blockNumber, StateKind.Init);
  await indexer.removeIPLDBlocks(block.blockNumber, StateKind.DiffStaged);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
