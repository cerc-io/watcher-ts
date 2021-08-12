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

export const subscribeLogs = gql`
subscription SubscriptionReceipt {
  listen(topic: "receipt_cids") {
    relatedNode {
      ... on ReceiptCid {
        logContracts
        topic0S
        topic1S
        topic2S
        topic3S
        contract
        ethTransactionCidByTxId {
          txHash
          ethHeaderCidByHeaderId {
            blockHash
            blockNumber
            parentHash
          }
        }
      }
    }
  }
}
`;

export const subscribeBlocks = gql`
subscription {
  listen(topic: "header_cids") {
    relatedNode {
      ... on EthHeaderCid {
        blockHash
        blockNumber
        parentHash
        timestamp
      }
    }
  }
}
`;

export const subscribeTransactions = gql`
subscription SubscriptionHeader {
  listen(topic: "transaction_cids") {
    relatedNode {
      ... on EthTransactionCid {
        txHash
        ethHeaderCidByHeaderId {
          blockHash
          blockNumber
          parentHash
        }
      }
    }
  }
}
`;

export default {
  getStorageAt,
  getLogs,
  getBlockWithTransactions,
  getBlockByHash,
  subscribeLogs,
  subscribeBlocks,
  subscribeTransactions
};
