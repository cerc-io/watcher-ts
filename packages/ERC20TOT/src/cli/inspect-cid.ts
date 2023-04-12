//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { InspectCIDCmd } from '@cerc-io/cli';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:inspect-cid');

const main = async (): Promise<void> => {
  const inspectCIDCmd = new InspectCIDCmd();
  await inspectCIDCmd.init(Database);

  await inspectCIDCmd.initIndexer(Indexer);

  await inspectCIDCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
