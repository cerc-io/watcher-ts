//
// Copyright 2021 Vulcanize, Inc.
//

import { ResetWatcherCmd } from '@cerc-io/cli';

import { Database } from '../../database';
import { Indexer } from '../../indexer';

export const command = 'watcher';

export const desc = 'Reset watcher to a block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const resetWatcherCmd = new ResetWatcherCmd();
  await resetWatcherCmd.init(argv, Database);

  await resetWatcherCmd.initIndexer(Indexer);

  await resetWatcherCmd.exec();
};
