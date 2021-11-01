//
// Copyright 2021 Vulcanize, Inc.
//

import { EventData } from '../../src/utils';

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
