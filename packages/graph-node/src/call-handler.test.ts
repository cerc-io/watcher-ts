//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';

import { instantiate } from './index';

describe('call handler in mapping code', () => {
  let exports: any;

  it('should load the subgraph example wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/example1/build/Example1/Example1.wasm');
    const instance = await instantiate(filePath);
    exports = instance.exports;
  });

  xit('should execute the handler function', () => {
    const { _start, handleTest, Test, TestEventId, Block, Address, __new, __newString, BigInt } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();

    const eventPtr = __new(TestEventId);
    const event = Test.wrap(eventPtr);
    const addStrPtr = __newString('0xCA6D29232D1435D8198E3E5302495417dD073d61');
    event.address = Address.fromString(addStrPtr);
    event.logIndex = BigInt.fromI32(0);
    event.transactionLogIndex = BigInt.fromI32(0);

    const blockPtr = __new(Block);
    event.block = blockPtr;

    handleTest(eventPtr);
  });
});
