//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';

import { getConfig } from '@cerc-io/util';

import { Database } from '../../database';

const log = debug('vulcanize:reset-state');

export const command = 'state';

export const desc = 'Reset State to a given block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const { blockNumber } = argv;
  const config = await getConfig(argv.configFile);

  // Initialize database
  const db = new Database(config.database);
  await db.init();

  // Create a DB transaction
  const dbTx = await db.createTransactionRunner();

  console.time('time:reset-state');
  try {
    // Delete all State entries after the given block
    await db.removeStatesAfterBlock(dbTx, blockNumber);

    // Reset the stateSyncStatus.
    const stateSyncStatus = await db.getStateSyncStatus();

    if (stateSyncStatus) {
      if (stateSyncStatus.latestIndexedBlockNumber > blockNumber) {
        await db.updateStateSyncStatusIndexedBlock(dbTx, blockNumber, true);
      }

      if (stateSyncStatus.latestCheckpointBlockNumber > blockNumber) {
        await db.updateStateSyncStatusCheckpointBlock(dbTx, blockNumber, true);
      }
    }

    dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }
  console.timeEnd('time:reset-state');

  log(`Reset state successfully to block ${blockNumber}`);
};
