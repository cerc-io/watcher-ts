//
// Copyright 2022 Vulcanize, Inc.
//

import { expect } from 'chai';
import { providers, Contract } from 'ethers';
import 'mocha';

import { Config, getConfig } from './common';
import {
  uniswapV2FactoryABI,
  uniswapV2FactoryAddress,
  uniswapV2PairABI,
  uniswapV2PairAddress,
  usdcABI,
  usdcAddress,
  compoundABI,
  compoundAddress,
  daiABI,
  daiAddress
} from './test-data';

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
      const args = [100]

      const result1 = await contract1.allPairs(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.allPairs(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for allPairsLength', async () => {
      const result1 = await contract1.allPairsLength({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.allPairsLength({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for feeTo', async () => {
      const result1 = await contract1.feeTo({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.feeTo({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for feeToSetter', async () => {
      const result1 = await contract1.feeToSetter({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.feeToSetter({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for getPair', async () => {
      const args = ["0x8e870d67f660d95d5be530380d0ec0bd388289e1", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"]

      const result1 = await contract1.getPair(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.getPair(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });
  });

  describe('match results for eth-calls to UniswapV2 Pair', async () => {
    let contract1: Contract;
    let contract2: Contract;

    before("initialize contracts", async () => {
      contract1 = new Contract(uniswapV2PairAddress, uniswapV2PairABI, provider1);
      contract2 = new Contract(uniswapV2PairAddress, uniswapV2PairABI, provider2);
    });

    it('should match results for DOMAIN_SEPARATOR', async () => {
      const result1 = await contract1.DOMAIN_SEPARATOR({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.DOMAIN_SEPARATOR({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for MINIMUM_LIQUIDITY', async () => {
      const result1 = await contract1.MINIMUM_LIQUIDITY({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.MINIMUM_LIQUIDITY({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for PERMIT_TYPEHASH', async () => {
      const result1 = await contract1.PERMIT_TYPEHASH({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.PERMIT_TYPEHASH({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for allowance', async () => {
      const args = ["0x9c77233bbd235a3ed219daa051e0a3de5ce03c3e", "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"]

      const result1 = await contract1.allowance(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.allowance(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for balanceOf', async () => {
      const args = ["0x052ba6f57c9184a89c34196ee4f3adacaeb58e8d"]

      const result1 = await contract1.balanceOf(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.balanceOf(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for decimals', async () => {
      const result1 = await contract1.decimals({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.decimals({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for factory', async () => {
      const result1 = await contract1.factory({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.factory({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for getReserves', async () => {
      const result1 = await contract1.getReserves({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.getReserves({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for kLast', async () => {
      const result1 = await contract1.kLast({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.kLast({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for name', async () => {
      const result1 = await contract1.name({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.name({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for nonces', async () => {
      const args = ["0xE0e8C1D735698060477e79a8e4C20276Fc2Ec7A7"]

      const result1 = await contract1.nonces(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.nonces(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for price0CumulativeLast', async () => {
      const result1 = await contract1.price0CumulativeLast({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.price0CumulativeLast({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for price1CumulativeLast', async () => {
      const result1 = await contract1.price1CumulativeLast({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.price1CumulativeLast({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for symbol', async () => {
      const result1 = await contract1.symbol({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.symbol({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for token0', async () => {
      const result1 = await contract1.token0({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.token0({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for token1', async () => {
      const result1 = await contract1.token1({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.token1({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for totalSupply', async () => {
      const result1 = await contract1.totalSupply({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.totalSupply({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });
  });

  describe('match results for eth-calls to USDC', async () => {
    let contract1: Contract;
    let contract2: Contract;

    before("initialize contracts", async () => {
      contract1 = new Contract(usdcAddress, usdcABI, provider1);
      contract2 = new Contract(usdcAddress, usdcABI, provider2);
    });

    it('should match results for CANCEL_AUTHORIZATION_TYPEHASH', async () => {
      const result1 = await contract1.CANCEL_AUTHORIZATION_TYPEHASH({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.CANCEL_AUTHORIZATION_TYPEHASH({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for DOMAIN_SEPARATOR', async () => {
      const result1 = await contract1.DOMAIN_SEPARATOR({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.DOMAIN_SEPARATOR({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for PERMIT_TYPEHASH', async () => {
      const result1 = await contract1.PERMIT_TYPEHASH({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.PERMIT_TYPEHASH({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for RECEIVE_WITH_AUTHORIZATION_TYPEHASH', async () => {
      const result1 = await contract1.RECEIVE_WITH_AUTHORIZATION_TYPEHASH({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.RECEIVE_WITH_AUTHORIZATION_TYPEHASH({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for TRANSFER_WITH_AUTHORIZATION_TYPEHASH', async () => {
      const result1 = await contract1.TRANSFER_WITH_AUTHORIZATION_TYPEHASH({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.TRANSFER_WITH_AUTHORIZATION_TYPEHASH({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for allowance', async () => {
      const args = ["0xa064c5d674b0de5ac8d1d1ade3fba7569525ac44", "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"];

      const result1 = await contract1.allowance(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.allowance(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    xit('should match results for authorizationState', async () => {
      const args = [""];

      const result1 = await contract1.authorizationState(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.authorizationState(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for balanceOf', async () => {
      const args = ["0x95ba4cf87d6723ad9c0db21737d862be80e93911"]

      const result1 = await contract1.balanceOf(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.balanceOf(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for blacklister', async () => {
      const result1 = await contract1.blacklister({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.blacklister({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for currency', async () => {
      const result1 = await contract1.currency({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.currency({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for decimals', async () => {
      const result1 = await contract1.decimals({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.decimals({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    xit('should match results for isBlacklisted', async () => {
      const args = ["0x95ba4cf87d6723ad9c0db21737d862be80e93911"]

      const result1 = await contract1.isBlacklisted(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.isBlacklisted(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    xit('should match results for isMinter', async () => {
      const args = ["0x95ba4cf87d6723ad9c0db21737d862be80e93911"]

      const result1 = await contract1.isMinter(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.isMinter(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for masterMinter', async () => {
      const result1 = await contract1.masterMinter({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.masterMinter({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    xit('should match results for minterAllowance', async () => {
      const args = ["0x95ba4cf87d6723ad9c0db21737d862be80e93911"]

      const result1 = await contract1.minterAllowance(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.minterAllowance(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for name', async () => {
      const result1 = await contract1.name({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.name({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    xit('should match results for nonces', async () => {
      const args = ["0x95ba4cf87d6723ad9c0db21737d862be80e93911"]

      const result1 = await contract1.nonces(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.nonces(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for owner', async () => {
      const result1 = await contract1.owner({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.owner({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for paused', async () => {
      const result1 = await contract1.paused({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.paused({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for pauser', async () => {
      const result1 = await contract1.pauser({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.pauser({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for rescuer', async () => {
      const result1 = await contract1.rescuer({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.rescuer({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for symbol', async () => {
      const result1 = await contract1.symbol({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.symbol({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for totalSupply', async () => {
      const result1 = await contract1.totalSupply({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.totalSupply({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for version', async () => {
      const result1 = await contract1.version({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.version({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });
  });

  describe('match results for eth-calls to Compound', async () => {
    let contract1: Contract;
    let contract2: Contract;

    before("initialize contracts", async () => {
      contract1 = new Contract(compoundAddress, compoundABI, provider1);
      contract2 = new Contract(compoundAddress, compoundABI, provider2);
    });

    it('should match results for DELEGATION_TYPEHASH', async () => {
      const result1 = await contract1.DELEGATION_TYPEHASH({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.DELEGATION_TYPEHASH({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for DOMAIN_TYPEHASH', async () => {
      const result1 = await contract1.DOMAIN_TYPEHASH({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.DOMAIN_TYPEHASH({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for allowance', async () => {
      const args = ["0xa5ffc832b23606f82005688d734c099dfabd5313", "0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4"]

      const result1 = await contract1.allowance(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.allowance(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for balanceOf', async () => {
      const args = ["0x2FAF487A4414Fe77e2327F0bf4AE2a264a776AD2"]

      const result1 = await contract1.balanceOf(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.balanceOf(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    xit('should match results for checkpoints', async () => {
      const result1 = await contract1.checkpoints({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.checkpoints({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for decimals', async () => {
      const result1 = await contract1.decimals({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.decimals({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for delegates', async () => {
      const args = ["0xdaaf40dae51ad67f1eeb8c8bded831f7ab150830"]

      const result1 = await contract1.delegates(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.delegates(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    xit('should match results for getCurrentVotes', async () => {
      const result1 = await contract1.getCurrentVotes({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.getCurrentVotes({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    xit('should match results for getPriorVotes', async () => {
      const result1 = await contract1.getPriorVotes({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.getPriorVotes({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for name', async () => {
      const result1 = await contract1.name({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.name({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    xit('should match results for nonces', async () => {
      const args = ["0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4"]

      const result1 = await contract1.nonces(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.nonces(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for numCheckpoints', async () => {
      const args = ["0xc00e94Cb662C3520282E6f5717214004A7f26888"]

      const result1 = await contract1.numCheckpoints(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.numCheckpoints(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for symbol', async () => {
      const result1 = await contract1.symbol({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.symbol({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for totalSupply', async () => {
      const result1 = await contract1.totalSupply({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.totalSupply({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });
  });

  describe('match results for eth-calls to Dai', async () => {
    let contract1: Contract;
    let contract2: Contract;

    before("initialize contracts", async () => {
      contract1 = new Contract(daiAddress, daiABI, provider1);
      contract2 = new Contract(daiAddress, daiABI, provider2);
    });

    it('should match results for DOMAIN_SEPARATOR', async () => {
      const result1 = await contract1.DOMAIN_SEPARATOR({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.DOMAIN_SEPARATOR({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for PERMIT_TYPEHASH', async () => {
      const result1 = await contract1.PERMIT_TYPEHASH({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.PERMIT_TYPEHASH({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for allowance', async () => {
      const args = ["0x74ae284dd6044db63dc268f52131571a3b80ad33", "0xa91902085405CE0F648a7Eb82045Aefc1B7BAC01"]

      const result1 = await contract1.allowance(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.allowance(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for balanceOf', async () => {
      const args = ["0xab78b4c4a28f6e449e0bf2d6eb4f4f0316343d2a"]

      const result1 = await contract1.balanceOf(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.balanceOf(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for decimals', async () => {
      const result1 = await contract1.decimals({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.decimals({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for name', async () => {
      const result1 = await contract1.name({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.name({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    it('should match results for nonces', async () => {
      const args = [""]

      const result1 = await contract1.nonces(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.nonces(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for symbol', async () => {
      const result1 = await contract1.symbol({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.symbol({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for totalSupply', async () => {
      const result1 = await contract1.totalSupply({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.totalSupply({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    it('should match results for version', async () => {
      const result1 = await contract1.version({blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.version({blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });

    // TODO args
    it('should match results for wards', async () => {
      const args = ["0xdDb108893104dE4E1C6d0E47c42237dB4E617ACc"]

      const result1 = await contract1.wards(...args, {blockTag: config.blockTag})
      expect(result1).to.not.be.empty;

      const result2 = await contract2.wards(...args, {blockTag: config.blockTag})
      expect(result2).to.not.be.empty;

      expect(result1).to.deep.equal(result2)
    });
  });
});
