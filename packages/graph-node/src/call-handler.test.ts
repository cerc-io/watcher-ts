//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';

import { getDummyEventData } from '../test/utils';
import { instantiate } from './loader';
import { createEvent } from './utils';

describe('call handler in mapping code', () => {
  let exports: any;

  it('should load the subgraph example wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/example1/build/Example1/Example1.wasm');
    const instance = await instantiate(filePath);
    exports = instance.exports;
  });

  it('should execute the handler function', async () => {
    const {
      _start,
      handleTest
    } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();

    const eventData = getDummyEventData();

    // Create event params data.
    eventData.eventParams = [
      {
        name: 'param1',
        value: 'abc',
        kind: 'string'
      },
      {
        name: 'param2',
        value: BigInt(123),
        kind: 'uint256'
      }
    ];

    // Dummy contract address string.
    const contractAddress = '0xCA6D29232D1435D8198E3E5302495417dD073d61';

    // Create Test event to be passed to handler.
    const test = await createEvent(exports, contractAddress, eventData);

    await handleTest(test);
  });
});
