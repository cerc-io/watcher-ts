//
// Copyright 2022 Vulcanize, Inc.
//

import path from 'path';
import debug from 'debug';
import assert from 'assert';

import { getConfig, initClients, JobQueue, Config, verifyCheckpointData } from '@cerc-io/util';
import { GraphWatcher, Database as GraphDatabase } from '@cerc-io/graph-node';

import { Database } from '../../database';
import { Indexer } from '../../indexer';

const log = debug('vulcanize:checkpoint-verify');

export const command = 'verify';

export const desc = 'Verify checkpoint';

export const builder = {
  cid: {
    alias: 'c',
    type: 'string',
    demandOption: true,
    describe: 'Checkpoint CID to be verified'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const config: Config = await getConfig(argv.configFile);
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, '../../entity/*'));
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

  const ipldBlock = await indexer.getIPLDBlockByCid(argv.cid);
  assert(ipldBlock, 'IPLDBlock for the provided CID doesn\'t exist.');
  const data = indexer.getIPLDData(ipldBlock);

  log(`Verifying checkpoint data for contract ${ipldBlock.contractAddress}`);
  await verifyCheckpointData(graphDb, ipldBlock.block, data);
  log('Checkpoint data verified');

  await db.close();
};