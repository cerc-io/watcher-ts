//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { FillCmd } from '@cerc-io/cli';

import { Database, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP } from './database';
import { Indexer } from './indexer';
import { EventWatcher } from './events';

const log = debug('vulcanize:fill');

export const main = async (): Promise<any> => {
  const fillCmd = new FillCmd();
  await fillCmd.init(Database, Indexer, EventWatcher, {}, ENTITY_QUERY_TYPE_MAP, ENTITY_TO_LATEST_ENTITY_MAP);

  await fillCmd.exec();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});
