//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';
import assert from 'assert';

import { getConfig } from '@vulcanize/util';

import { Database } from '../../database';

const log = debug('vulcanize:reset-ipld-state');

export const command = 'ipld-state';

export const desc = 'Reset IPLD state in the given range';

export const builder = {
  startBlock: {
    type: 'number'
  },
  endBlock: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const { startBlock, endBlock } = argv;
  assert(startBlock <= endBlock, 'endBlock should be greater than or equal to startBlock');

  const config = await getConfig(argv.configFile);

  // Initialize database
  const db = new Database(config.database);
  await db.init();

  // Create a DB transaction
  const dbTx = await db.createTransactionRunner();

  console.time('time:reset-ipld-state');
  try {
    // Delete all IPLDBlock entries in the given range
    await db.removeIPLDBlocksInRange(dbTx, startBlock, endBlock);

    dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }
  console.timeEnd('time:reset-ipld-state');

  log(`Reset ipld-state successfully for range [${startBlock}, ${endBlock}]`);
};
