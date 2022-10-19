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

import { getConfig, fillBlocks, JobQueue, DEFAULT_CONFIG_PATH, Config, initClients, StateKind } from '@cerc-io/util';
import { GraphWatcher, Database as GraphDatabase } from '@cerc-io/graph-node';
import * as codec from '@ipld/dag-cbor';

import { Database } from '../database';
import { Indexer } from '../indexer';
import { EventWatcher } from '../events';
import { State } from '../entity/State';

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
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, '../entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, ethClient, ethProvider, config.server);

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();

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

  const eventWatcher = new EventWatcher(config.upstream, ethClient, indexer, pubsub, jobQueue);

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
      prefetch: true,
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

  // Fill the States.
  for (const checkpoint of importData.stateCheckpoints) {
    let state = new State();

    state = Object.assign(state, checkpoint);
    state.block = block;

    state.data = Buffer.from(codec.encode(state.data));

    state = await indexer.saveOrUpdateState(state);
    await graphWatcher.updateEntitiesFromState(state);
  }

  // Mark snapshot block as completely processed.
  block.isComplete = true;
  await indexer.updateBlockProgress(block, block.lastProcessedEventIndex);
  await indexer.updateSyncStatusChainHead(block.blockHash, block.blockNumber);
  await indexer.updateSyncStatusIndexedBlock(block.blockHash, block.blockNumber);
  await indexer.updateStateSyncStatusIndexedBlock(block.blockNumber);
  await indexer.updateStateSyncStatusCheckpointBlock(block.blockNumber);

  // The 'diff_staged' and 'init' State entries are unnecessary as checkpoints have been already created for the snapshot block.
  await indexer.removeStates(block.blockNumber, StateKind.Init);
  await indexer.removeStates(block.blockNumber, StateKind.DiffStaged);

  log(`Import completed for snapshot block at height ${block.blockNumber}`);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
