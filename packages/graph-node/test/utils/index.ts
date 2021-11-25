//
// Copyright 2021 Vulcanize, Inc.
//

import { EventData } from '../../src/utils';
import { Database } from '../../src/database';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const getDummyEventData = (): EventData => {
  const block = {
    blockHash: ZERO_HASH,
    blockNumber: '0',
    timestamp: '0',
    parentHash: ZERO_HASH,
    stateRoot: ZERO_HASH,
    td: ZERO_HASH,
    txRoot: ZERO_HASH,
    receiptRoot: ZERO_HASH,
    uncleHash: ZERO_HASH,
    difficulty: '0',
    gasLimit: '0',
    gasUsed: '0'
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
    inputs: [],
    event: {},
    eventIndex: 0
  };
};

export const getTestDatabase = (): Database => {
  return new Database({ type: 'postgres' }, '');
};
