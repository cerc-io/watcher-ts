//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { WatchContractCmd } from '@cerc-io/cli';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:watch-contract');

const main = async (): Promise<void> => {
  const watchContractCmd = new WatchContractCmd();
  await watchContractCmd.init(Database);

  await watchContractCmd.initIndexer(Indexer);

  await watchContractCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
