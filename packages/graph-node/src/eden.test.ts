//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';

import { instantiate } from './index';

describe('eden wasm loader tests', () => {
  it('should load the subgraph network wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetwork/EdenNetwork.wasm');
    const { exports: { _start } } = await instantiate(filePath);
    _start();
  });

  it('should load the subgraph network distribution wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkDistribution/EdenNetworkDistribution.wasm');
    const { exports: { _start } } = await instantiate(filePath);
    _start();
  });

  it('should load the subgraph network governance wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkGovernance/EdenNetworkGovernance.wasm');
    const { exports: { _start } } = await instantiate(filePath);
    _start();
  });
});
