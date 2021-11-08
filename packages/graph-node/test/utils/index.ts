//
// Copyright 2021 Vulcanize, Inc.
//
import { getConfig } from '@vulcanize/util';

import { EventData } from '../../src/utils';
import { Database } from '../../src/database';

const CONFIG_PATH = 'test/config/local.toml';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const getDummyEventData = (): EventData => {
  const block = {
    hash: ZERO_HASH,
    number: 0,
    timestamp: 0,
    parentHash: ZERO_HASH
  };

  const tx = {
    hash: ZERO_HASH,
    index: 0,
    from: ZERO_ADDRESS,
    to: ZERO_ADDRESS
  };

  return {
    block,
    tx,
    eventParams: [],
    eventIndex: 0
  };
};

export const getTestDatabase = async (): Promise<Database> => {
  const config = await getConfig(CONFIG_PATH);
  const { database: dbConfig } = config;
  const db = new Database(dbConfig, '');

  return db;
};
