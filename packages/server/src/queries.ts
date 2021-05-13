import { gql } from 'graphql-request';

export const queryBalanceOf = gql`
query getBalance($blockHash: String!, $token: String!, $owner: String!) {
  balanceOf(blockHash: $blockHash, token: $token, owner: $owner) {
    value
    proof {
      data
    }
  }
}
`;

export const queryAllowance = gql`
query getAllowance($blockHash: String!, $token: String!, $owner: String!, $spender: String!) {
  allowance(blockHash: $blockHash, token: $token, owner: $owner, spender: $spender) {
    value
    proof {
      data
    }
  }
}
`;

export const queryEvents = gql`
query getEvents($blockHash: String!, $token: String!) {
  events(blockHash: $blockHash, token: $token) {
    event {
      __typename
      ... on TransferEvent {
        from
        to
        value
      }
      ... on ApprovalEvent {
        owner
        spender
        value
      }
    }
    proof {
      data
    }
  }
}
`;
