import { gql } from 'graphql-request';

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
query getLogs($blockHash: Bytes32!, $contract: Address!) {
  getLogs(blockHash: $blockHash, contract: $contract) {
    account {
      address
    }
    topics
    data
    cid
    ipldBlock
  }
}
`;

export default {
  getStorageAt,
  getLogs
};
