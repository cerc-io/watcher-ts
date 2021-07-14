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
  }
}
`;

export const getBlockWithTransactions = gql`
query allEthHeaderCids($blockNumber: BigInt) {
  allEthHeaderCids(condition: { blockNumber: $blockNumber }) {
    nodes {
      cid
      blockNumber
      blockHash
      timestamp
      ethTransactionCidsByHeaderId {
        nodes {
          cid
          txHash
        }
      }
    }
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
  subscribeLogs,
  subscribeBlocks,
  subscribeTransactions
};
