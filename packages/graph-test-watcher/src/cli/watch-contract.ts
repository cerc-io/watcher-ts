//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { WatchContract } from '@cerc-io/cli';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:watch-contract');

const main = async (): Promise<void> => {
  const watchContract = new WatchContract();
  await watchContract.init(Database, Indexer);

  await watchContract.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
