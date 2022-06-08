//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from '@apollo/client/core';

export const getStorageAt = gql`
query getStorageAt($blockHash: Bytes32!, $contract: Address!, $slot: Bytes32!) {
  getStorageAt(blockHash: $blockHash, contract: $contract, slot: $slot) {
    value
    cid
    ipldBlock
  }
}
`;

export const getLogs = gql`
query getLogs($blockHash: Bytes32!, $contract: Address) {
  getLogs(blockHash: $blockHash, contract: $contract) {
    account {
      address
    }
    transaction {
      hash
    }
    topics
    data
    index
    cid
    ipldBlock
    receiptCID
    status
  }
  block(hash: $blockHash) {
    number
    timestamp
    parent {
      hash
    }
  }
}
`;

export const getBlockWithTransactions = gql`
query allEthHeaderCids($blockNumber: BigInt, $blockHash: String) {
  allEthHeaderCids(condition: { blockNumber: $blockNumber, blockHash: $blockHash }) {
    nodes {
      cid
      blockNumber
      blockHash
      parentHash
      timestamp
      ethTransactionCidsByHeaderId {
        nodes {
          cid
          txHash
          index
          src
          dst
        }
      }
    }
  }
}
`;

export const getBlocks = gql`
query allEthHeaderCids($blockNumber: BigInt, $blockHash: String) {
  allEthHeaderCids(condition: { blockNumber: $blockNumber, blockHash: $blockHash }) {
    nodes {
      cid
      blockNumber
      blockHash
      parentHash
      timestamp
      stateRoot
      td
      txRoot
      receiptRoot
    }
  }
}
`;

export const getFullBlocks = gql`
query allEthHeaderCids($blockNumber: BigInt, $blockHash: String) {
  allEthHeaderCids(condition: { blockNumber: $blockNumber, blockHash: $blockHash }) {
    nodes {
      cid
      blockNumber
      blockHash
      parentHash
      timestamp
      stateRoot
      td
      txRoot
      receiptRoot
      uncleRoot
      bloom
      blockByMhKey {
        key
        data
      }
    }
  }
}
`;

export const getFullTransaction = gql`
query ethTransactionCidByTxHash($txHash: String!) {
  ethTransactionCidByTxHash(txHash: $txHash) {
    cid
    txHash
    index
    src
    dst
    blockByMhKey {
      data
    }
  }
}
`;

export const getBlockByHash = gql`
query block($blockHash: Bytes32) {
  block(hash: $blockHash) {
    number
    hash
    parent {
      hash
    }
    timestamp
  }
}
`;

export default {
  getStorageAt,
  getLogs,
  getBlockWithTransactions,
  getBlocks,
  getFullBlocks,
  getFullTransaction,
  getBlockByHash
};
