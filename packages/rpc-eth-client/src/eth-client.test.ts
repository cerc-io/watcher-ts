//
// Copyright 2021 Vulcanize, Inc.
//

import { expect } from 'chai';
import 'mocha';

import { EthClient as GqlEthClient } from '@cerc-io/ipld-eth-client';

import { EthClient } from '../index';

const RPC_ENDPOINT = 'http://localhost:8545';
const GQL_ENDPOINT = 'http://localhost:8083/graphql';

const BLOCK_HASH = '0xef53edd41f1aca301d6dd285656366da7e29f0da96366fde04f6d90ad750c973';
const BLOCK_NUMBER = 28;

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
      blockHash: BLOCK_HASH,
      contract: '0x1ca7c995f8eF0A2989BbcE08D5B7Efe50A584aa1',
      slot: '0xf4db8e9deefce79f91199eb78ba5f619827e53284bc9b3b7f7a525da2596a022'
    };

    const gqlResult = await gqlEthClient.getStorageAt(params);
    const rpcResult = await rpcEthClient.getStorageAt(params);

    expect(rpcResult.value).to.equal(gqlResult.value);
  });

  describe('Compare getBlockWithTransactions method', () => {
    const compareBlock = (result: any, expected: any) => {
      const { __typename, cid, ethTransactionCidsByHeaderId, ...expectedNode } = expected.allEthHeaderCids.nodes[0];
      const expectedTransactions = ethTransactionCidsByHeaderId.nodes.map(({ __typename, cid, ...tx }: any) => tx);

      const { ethTransactionCidsByHeaderId: { nodes: rpcTxs }, ...rpcNode } = result.allEthHeaderCids.nodes[0];
      expect(rpcNode).to.deep.equal(expectedNode);
      expect(rpcTxs).to.deep.equal(expectedTransactions);
    };

    it('With blockHash', async () => {
      // TODO: Get a block with transactions
      const blockHash = BLOCK_HASH;

      const gqlResult = await gqlEthClient.getBlockWithTransactions({ blockHash });
      const rpcResult = await rpcEthClient.getBlockWithTransactions({ blockHash });

      compareBlock(rpcResult, gqlResult);
    });

    it('With blockNumber', async () => {
      const blockNumber = BLOCK_NUMBER;

      const gqlResult = await gqlEthClient.getBlockWithTransactions({ blockNumber });
      const rpcResult = await rpcEthClient.getBlockWithTransactions({ blockNumber });

      compareBlock(rpcResult, gqlResult);
    });
  });

  describe('Compare getBlocks method', () => {
    const compareBlock = (result: any, expected: any) => {
      const { __typename, cid, ...expectedNode } = expected.allEthHeaderCids.nodes[0];
      expect(result.allEthHeaderCids.nodes[0]).to.deep.equal(expectedNode);
    };

    it('With blockHash', async () => {
      const blockHash = BLOCK_HASH;

      const gqlResult = await gqlEthClient.getBlocks({ blockHash });
      const rpcResult = await rpcEthClient.getBlocks({ blockHash });

      compareBlock(rpcResult, gqlResult);
    });

    it('With blockNumber', async () => {
      const blockNumber = BLOCK_NUMBER;

      const gqlResult = await gqlEthClient.getBlocks({ blockNumber });
      const rpcResult = await rpcEthClient.getBlocks({ blockNumber });

      compareBlock(rpcResult, gqlResult);
    });
  });

  describe('Compare getFullBlocks method', async () => {
    const compareBlock = (result: any, expected: any) => {
      const {
        __typename,
        cid,
        blockByMhKey: expectedBlockByMhKey,
        // blockByMhKey: {
        //   data: expectedData
        // },
        ...expectedNode
      } = expected.allEthHeaderCids.nodes[0];
      const {
        blockByMhKey,
        // blockByMhKey: {
        //   data
        // },
        ...node
      } = result.allEthHeaderCids.nodes[0];
      expect(node).to.deep.equal(expectedNode);

      // TODO: Match RLP encoded data
      // TODO: Compare decoded data
      // expect(data).to.equal(expectedData);
    };

    it('With blockHash', async () => {
      const blockHash = BLOCK_HASH;

      const gqlResult = await gqlEthClient.getFullBlocks({ blockHash });
      const rpcResult = await rpcEthClient.getFullBlocks({ blockHash });

      compareBlock(rpcResult, gqlResult);
    });

    it('With blockNumber', async () => {
      const blockNumber = BLOCK_NUMBER;

      const gqlResult = await gqlEthClient.getFullBlocks({ blockNumber });
      const rpcResult = await rpcEthClient.getFullBlocks({ blockNumber });

      compareBlock(rpcResult, gqlResult);
    });
  });

  it('Compare getFullTransaction method', async () => {
    const txHash = '0xd459a61a7058dbc1a1ce3bd06aad551f75bbb088006d953c2f373e108c5e52fb';
    const gqlResult = await gqlEthClient.getFullTransaction(txHash);
    const rpcResult = await rpcEthClient.getFullTransaction(txHash);

    const { ethTransactionCidByTxHash: { __typename, cid, blockByMhKey: { data: expectedRawTx }, ...expectedTx } } = gqlResult;
    const { ethTransactionCidByTxHash: { blockByMhKey: { data: rawTx }, ...tx } } = rpcResult;
    expect(tx).to.deep.equal(expectedTx);
    expect(rawTx).to.deep.equal(expectedRawTx);
  });

  describe('Compare getBlockByHash method', async () => {
    const compareBlock = (result: any, expected: any) => {
      const {
        __typename,
        parent: expectedParent,
        blockByMhKey: expectedBlockByMhKey,
        ...expectedBlock
      } = expected.block;

      const { parent, ...block } = result.block;
      expect(block).to.deep.equal(expectedBlock);
      expect(parent.hash).to.equal(expectedParent.hash);
    };

    it('With blockHash', async () => {
      const gqlResult = await gqlEthClient.getBlockByHash(BLOCK_HASH);
      const rpcResult = await rpcEthClient.getBlockByHash(BLOCK_HASH);

      compareBlock(rpcResult, gqlResult);
    });

    it('Without blockHash', async () => {
      const gqlResult = await gqlEthClient.getBlockByHash();
      const rpcResult = await rpcEthClient.getBlockByHash();

      compareBlock(rpcResult, gqlResult);
    });
  });

  describe('Compare getBlockByHash method', () => {
    const compareLogs = (result: any, expected: any) => {
      result.logs.forEach((log: any, index: number) => {
        const {
          __typename,
          account: expectedAccount,
          cid,
          ipldBlock,
          receiptCID,
          transaction: expectedTransaction,
          ...expectedLog
        } = expected.logs[index];

        const { account, transaction, ...rpcLog } = log;
        expect(rpcLog).to.deep.equal(expectedLog);
        expect(account.address).to.equal(expectedAccount.address);
        expect(transaction.hash).to.equal(expectedTransaction.hash);
      });
    };

    it('Without addresses', async () => {
      const blockHash = BLOCK_HASH;
      const blockNumber = BLOCK_NUMBER.toString();

      const gqlResult = await gqlEthClient.getLogs({ blockHash, blockNumber });
      const rpcResult = await rpcEthClient.getLogs({ blockHash, blockNumber });

      compareLogs(rpcResult, gqlResult);
    });

    it('With addresses', async () => {
      const addresses = [
        '0x36cefe5321b015ea74b1a08efd6d785360071d5d',
        '0x24cfbe2986e09ab7b7a5e4f8a6bf629b81840ef1'
      ];
      const blockHash = BLOCK_HASH;
      const blockNumber = BLOCK_NUMBER.toString();

      const gqlResult = await gqlEthClient.getLogs({ blockHash, blockNumber, addresses });
      const rpcResult = await rpcEthClient.getLogs({ blockHash, blockNumber, addresses });

      compareLogs(rpcResult, gqlResult);
    });
  });
});
