//
// Copyright 2022 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { IndexBlockCmd } from '@cerc-io/cli';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:index-block');

const main = async (): Promise<void> => {
  const indexBlockCmd = new IndexBlockCmd();
  await indexBlockCmd.init(Database);

  await indexBlockCmd.initIndexer(Indexer);

  await indexBlockCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
