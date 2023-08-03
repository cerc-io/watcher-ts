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
  it('Compare getStorageAt method', async () => {
    // TODO: Deploy contract in test and generate input params using solidity-mapper
    const params = {
      blockHash: '0xef53edd41f1aca301d6dd285656366da7e29f0da96366fde04f6d90ad750c973',
      contract: '0x1ca7c995f8eF0A2989BbcE08D5B7Efe50A584aa1',
      slot: '0xf4db8e9deefce79f91199eb78ba5f619827e53284bc9b3b7f7a525da2596a022'
    };

    const gqlResult = await gqlEthClient.getStorageAt(params);
    const rpcResult = await rpcEthClient.getStorageAt(params);

    expect(rpcResult.value).to.equal(gqlResult.value);
  });

  it('Compare getBlockWithTransactions method with blockHash', async () => {
    // TODO: Get a block with transactions
    const blockHash = '0xef53edd41f1aca301d6dd285656366da7e29f0da96366fde04f6d90ad750c973';

    const gqlResult = await gqlEthClient.getBlockWithTransactions({ blockHash });
    const rpcResult = await rpcEthClient.getBlockWithTransactions({ blockHash });

    const { __typename, cid, ethTransactionCidsByHeaderId, ...expectedNode } = gqlResult.allEthHeaderCids.nodes[0];
    const expectedTransactions = ethTransactionCidsByHeaderId.nodes.map(({ __typename, cid, ...tx }: any) => tx);

    const { ethTransactionCidsByHeaderId: { nodes: rpcTxs }, ...rpcNode } = rpcResult.allEthHeaderCids.nodes[0];
    expect(rpcNode).to.deep.equal(expectedNode);
    expect(rpcTxs).to.deep.equal(expectedTransactions);
  });

  it('Compare getBlockWithTransactions method with blockNumber', async () => {
    const blockNumber = 28;

    const gqlResult = await gqlEthClient.getBlockWithTransactions({ blockNumber });
    const rpcResult = await rpcEthClient.getBlockWithTransactions({ blockNumber });

    const { __typename, cid, ethTransactionCidsByHeaderId, ...expectedNode } = gqlResult.allEthHeaderCids.nodes[0];
    const expectedTransactions = ethTransactionCidsByHeaderId.nodes.map(({ __typename, cid, ...tx }: any) => tx);

    const { ethTransactionCidsByHeaderId: { nodes: rpcTxs }, ...rpcNode } = rpcResult.allEthHeaderCids.nodes[0];
    expect(rpcNode).to.deep.equal(expectedNode);
    expect(rpcTxs).to.deep.equal(expectedTransactions);
  });

  it('Compare getBlocks method with blockHash', async () => {
    const blockHash = '0xef53edd41f1aca301d6dd285656366da7e29f0da96366fde04f6d90ad750c973';

    const gqlResult = await gqlEthClient.getBlocks({ blockHash });
    const rpcResult = await rpcEthClient.getBlocks({ blockHash });

    const { __typename, cid, ...expectedNode } = gqlResult.allEthHeaderCids.nodes[0];
    expect(rpcResult.allEthHeaderCids.nodes[0]).to.deep.equal(expectedNode);
  });

  it('Compare getBlocks method with blockNumber', async () => {
    const blockNumber = 28;

    const gqlResult = await gqlEthClient.getBlocks({ blockNumber });
    const rpcResult = await rpcEthClient.getBlocks({ blockNumber });

    const { __typename, cid, ...expectedNode } = gqlResult.allEthHeaderCids.nodes[0];
    expect(rpcResult.allEthHeaderCids.nodes[0]).to.deep.equal(expectedNode);
  });
});
