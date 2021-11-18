//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import debug from 'debug';
import { MoreThan } from 'typeorm';
import assert from 'assert';

import { getConfig, initClients, resetJobs, JobQueue } from '@vulcanize/util';
import { GraphWatcher, Database as GraphDatabase } from '@vulcanize/graph-node';

import { Database } from '../../database';
import { Indexer } from '../../indexer';
import { BlockProgress } from '../../entity/BlockProgress';

const log = debug('vulcanize:reset-state');

export const command = 'state';

export const desc = 'Reset state to block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const config = await getConfig(argv.configFile);
  await resetJobs(config);
  const { ethClient, postgraphileClient, ethProvider } = await initClients(config);

  // Initialize database.
  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, 'entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, postgraphileClient, config.server.subgraphPath);

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, postgraphileClient, ethProvider, jobQueue, graphWatcher);

  graphWatcher.setIndexer(indexer);
  await graphWatcher.init();

  const syncStatus = await indexer.getSyncStatus();
  assert(syncStatus, 'Missing syncStatus');

  const hooksStatus = await indexer.getHookStatus();
  assert(hooksStatus, 'Missing hooksStatus');

  const blockProgresses = await indexer.getBlocksAtHeight(argv.blockNumber, false);
  assert(blockProgresses.length, `No blocks at specified block number ${argv.blockNumber}`);
  assert(!blockProgresses.some(block => !block.isComplete), `Incomplete block at block number ${argv.blockNumber} with unprocessed events`);
  const [blockProgress] = blockProgresses;

  const dbTx = await db.createTransactionRunner();

  try {
    const entities = [BlockProgress];

    const removeEntitiesPromise = entities.map(async entityClass => {
      return db.removeEntities<any>(dbTx, entityClass, { blockNumber: MoreThan(argv.blockNumber) });
    });

    await Promise.all(removeEntitiesPromise);

    if (syncStatus.latestIndexedBlockNumber > blockProgress.blockNumber) {
      await indexer.updateSyncStatusIndexedBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
    }

    if (syncStatus.latestCanonicalBlockNumber > blockProgress.blockNumber) {
      await indexer.updateSyncStatusCanonicalBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
    }

    if (hooksStatus.latestProcessedBlockNumber > blockProgress.blockNumber) {
      await indexer.updateHookStatusProcessedBlock(blockProgress.blockNumber, true);
    }

    dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }

  log('Reset state successfully');
};
