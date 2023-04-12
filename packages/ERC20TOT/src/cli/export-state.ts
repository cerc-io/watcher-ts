//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { ExportStateCmd } from '@cerc-io/cli';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:export-state');

const main = async (): Promise<void> => {
  const exportStateCmd = new ExportStateCmd();
  await exportStateCmd.init(Database);

  await exportStateCmd.initIndexer(Indexer);

  await exportStateCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
