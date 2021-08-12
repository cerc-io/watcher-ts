//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from 'graphql-request';

const resultEvent = `
{
  block {
    number
    hash
    timestamp
    parentHash
  }
  tx {
    hash
    from
    to
    index
  }
  contract
  eventIndex

  event {
    __typename

    ... on PoolCreatedEvent {
      token0
      token1
      fee
      tickSpacing
      pool
    }

    ... on InitializeEvent {
      sqrtPriceX96
      tick
    }

    ... on MintEvent {
      sender
      owner
      tickLower
      tickUpper
      amount
      amount0
      amount1
    }

    ... on BurnEvent {
      owner
      tickLower
      tickUpper
      amount
      amount0
      amount1
    }

    ... on SwapEvent {
      sender
      recipient
      amount0
      amount1
      sqrtPriceX96
      liquidity
      tick
    }

    ... on IncreaseLiquidityEvent {
      tokenId
      liquidity
      amount0
      amount1
    }

    ... on DecreaseLiquidityEvent {
      tokenId
      liquidity
      amount0
      amount1
    }

    ... on CollectEvent {
      tokenId
      recipient
      amount0
      amount1
    }

    ... on TransferEvent {
      from
      to
      tokenId
    }
  }

  proof {
    data
  }
}
`;

export const subscribeEvents = gql`
  subscription SubscriptionEvents {
    onEvent 
      ${resultEvent}
  }
`;

export const queryEvents = gql`
query getEvents($blockHash: String!, $contract: String) {
  events(blockHash: $blockHash, contract: $contract)
    ${resultEvent}
}
`;

export const queryPosition = gql`
query getPosition($blockHash: String!, $tokenId: String!) {
  position(blockHash: $blockHash, tokenId: $tokenId) {
    nonce
    operator
    poolId
    tickLower
    tickUpper
    liquidity
    feeGrowthInside0LastX128
    feeGrowthInside1LastX128
    tokensOwed0
    tokensOwed1

    proof {
      data
    }
  }
}
`;

export const queryPoolIdToPoolKey = gql`
query poolIdToPoolKey($blockHash: String!, $poolId: String!) {
  poolIdToPoolKey(blockHash: $blockHash, poolId: $poolId) {
    token0
    token1
    fee
    
    proof {
      data
    }
  }
}
`;

export const queryGetPool = gql`
query getPool($blockHash: String!, $token0: String!, $token1: String!, $fee: String!) {
  getPool(blockHash: $blockHash, token0: $token0, token1: $token1, fee: $fee) {
    pool
    proof {
      data
    }
  }
}
`;

export const queryGetContract = gql`
query queryGetContract($type: String!) {
  getContract(type: $type) {
    address
  }
}
`;
