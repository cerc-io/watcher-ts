//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import path from 'path';

import { instantiate } from './index';
import exampleAbi from '../test/subgraph/example1/build/Example1/abis/Example1.json';

describe('eth-call wasm tests', () => {
  let exports: any;

  const contractAddress = process.env.EXAMPLE_CONTRACT_ADDRESS;
  assert(contractAddress);

  const data = {
    abis: {
      Example1: exampleAbi
    },
    dataSource: {
      address: contractAddress
    }
  };

  it('should load the subgraph example wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/example1/build/Example1/Example1.wasm');
    const instance = await instantiate(filePath, data);
    exports = instance.exports;
  });

  it('should execute exported function', async () => {
    const { _start, testEthCall } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();

    await testEthCall();
  });
});
