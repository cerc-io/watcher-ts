//
// Copyright 2024 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';

import { BackfillEventsDataCmd } from '@cerc-io/cli';

import { Database } from '../database';
import { Event } from '../entity/Event';

const log = debug('vulcanize:backfill-events-data');

const main = async (): Promise<void> => {
  const backFillCmd = new BackfillEventsDataCmd();
  await backFillCmd.init(Database);

  await backFillCmd.exec(Event);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
