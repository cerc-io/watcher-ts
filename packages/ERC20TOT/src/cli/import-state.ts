//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { ImportStateCmd } from '@cerc-io/cli';

import { Database } from '../database';
import { Indexer } from '../indexer';
import { State } from '../entity/State';

const log = debug('vulcanize:import-state');

export const main = async (): Promise<any> => {
  const importStateCmd = new ImportStateCmd();
  await importStateCmd.init(Database);

  await importStateCmd.initIndexer(Indexer);

  await importStateCmd.exec(State);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
