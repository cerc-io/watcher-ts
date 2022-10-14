//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';

import { getConfig } from '@cerc-io/util';

import { Database } from '../../database';

const log = debug('vulcanize:reset-ipld-state');

export const command = 'ipld-state';

export const desc = 'Reset IPLD state in the given range';

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

  console.time('time:reset-ipld-state');
  try {
    // Delete all IPLDBlock entries in the given range
    await db.removeIPLDBlocksAfterBlock(dbTx, blockNumber);

    // Reset the IPLD status.
    const ipldStatus = await db.getIPLDStatus();

    if (ipldStatus) {
      if (ipldStatus.latestHooksBlockNumber > blockNumber) {
        await db.updateIPLDStatusHooksBlock(dbTx, blockNumber, true);
      }

      if (ipldStatus.latestCheckpointBlockNumber > blockNumber) {
        await db.updateIPLDStatusCheckpointBlock(dbTx, blockNumber, true);
      }
    }

    dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }
  console.timeEnd('time:reset-ipld-state');

  log(`Reset ipld-state successfully to block ${blockNumber}`);
};
