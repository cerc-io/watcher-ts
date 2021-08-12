//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from 'graphql-request';

export const queryTotalSupply = gql`
query getTotalSupply($blockHash: String!, $token: String!) {
  totalSupply(blockHash: $blockHash, token: $token) {
    value
    proof {
      data
    }
  }
}
`;

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

export const queryName = gql`
query getName($blockHash: String!, $token: String!) {
  name(blockHash: $blockHash, token: $token) {
    value
    proof {
      data
    }
  }
}
`;

export const querySymbol = gql`
query getSymbol($blockHash: String!, $token: String!) {
  symbol(blockHash: $blockHash, token: $token) {
    value
    proof {
      data
    }
  }
}
`;

export const queryDecimals = gql`
query getDecimals($blockHash: String!, $token: String!) {
  decimals(blockHash: $blockHash, token: $token) {
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
