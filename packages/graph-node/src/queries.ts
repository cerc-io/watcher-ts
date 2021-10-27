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
