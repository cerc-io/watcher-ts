//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';

import { instantiate } from './index';

xdescribe('eden wasm loader tests', () => {
  it('should load the subgraph network wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetwork/EdenNetwork.wasm');
    await instantiate(filePath);
  });

  it('should load the subgraph network distribution wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkDistribution/EdenNetworkDistribution.wasm');
    await instantiate(filePath);
  });

  it('should load the subgraph network governance wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkGovernance/EdenNetworkGovernance.wasm');
    await instantiate(filePath);
  });
});
