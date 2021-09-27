//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';

import { instantiate } from './index';

describe('example wasm tests', () => {
  let exports: any;

  it('should load the subgraph example wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/example1/build/Example1/Example1.wasm');
    const instance = await instantiate(filePath);
    exports = instance.exports;
  });

  it('should execute exported function', async () => {
    const { testEthCall } = exports;
    testEthCall();
  });
});
