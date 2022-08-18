//
// Copyright 2022 Vulcanize, Inc.
//

import { expect } from 'chai';
import { providers, Contract } from 'ethers';
import 'mocha';

import { Config, getConfig } from './common';
import { uniswapV2FactoryABI, uniswapV2FactoryAddress } from './test-data';

const DEFAULT_CONFIG_FILE = './environments/local.toml';

describe('snapshot-test', () => {
  let config: Config;

  let provider1: providers.JsonRpcProvider;
  let provider2: providers.JsonRpcProvider;

  before("initialize providers", async () => {
    config = await getConfig(DEFAULT_CONFIG_FILE);

    provider1 = new providers.JsonRpcProvider(config.endpoint1URL);
    provider2 = new providers.JsonRpcProvider(config.endpoint2URL);
  });

  describe('match results for eth-calls to UniswapV2 Factory', async () => {
    let contract1: Contract;
    let contract2: Contract;

    before("initialize contracts", async () => {
      contract1 = new Contract(uniswapV2FactoryAddress, uniswapV2FactoryABI, provider1);
      contract2 = new Contract(uniswapV2FactoryAddress, uniswapV2FactoryABI, provider2);
    });

    it('should match results for allPairs', async () => {
      const result1 = await contract1.allPairs(100, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.allPairs(100, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });
  });
});
