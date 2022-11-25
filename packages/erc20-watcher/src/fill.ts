//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { FillCmd } from '@cerc-io/cli';

import { Database } from './database';
import { Indexer } from './indexer';

const log = debug('vulcanize:fill');

export const main = async (): Promise<any> => {
  const fillCmd = new FillCmd();
  await fillCmd.init(Database);
  await fillCmd.initIndexer(Indexer);
  await fillCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});
