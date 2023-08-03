//
// Copyright 2021 Vulcanize, Inc.
//

import { expect } from 'chai';
import 'mocha';

import { EthClient as GqlEthClient } from '@cerc-io/ipld-eth-client';

import { EthClient } from '../index';

const RPC_ENDPOINT = 'http://localhost:8545';
const GQL_ENDPOINT = 'http://localhost:8083/graphql';

describe('compare methods', () => {
  let gqlEthClient: GqlEthClient;
  let rpcEthClient: EthClient;

  before('initialize eth clients', async () => {
    gqlEthClient = new GqlEthClient({
      gqlEndpoint: GQL_ENDPOINT,
      cache: undefined
    });

    rpcEthClient = new EthClient({
      rpcEndpoint: RPC_ENDPOINT,
      cache: undefined
    });
  });

  // Compare eth-call results
  it('Compate getStorageAt method', async () => {
    // TODO: Deploy contract in test and generate input params using solidity-mapper
    const params = {
      blockHash: '0x43622aeb3dcb762ce1474426958fb9f1f071cabbcf92b5002c4e25f729a86f18',
      contract: '0x1ca7c995f8eF0A2989BbcE08D5B7Efe50A584aa1',
      slot: '0xf4db8e9deefce79f91199eb78ba5f619827e53284bc9b3b7f7a525da2596a022'
    };

    const gqlResult = await gqlEthClient.getStorageAt(params);
    const rpcResult = await rpcEthClient.getStorageAt(params);

    expect(gqlResult.value).to.equal(rpcResult.value);
  });
});
