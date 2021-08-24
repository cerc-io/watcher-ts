//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from 'graphql-request';

const resultPool = `
{
  id,
  feeTier,
  liquidity,
  sqrtPrice,
  tick,
  token0 {
    id
  },
  token0Price,
  token1 {
    id
  },
  token1Price,
  totalValueLockedToken0,
  totalValueLockedToken1,
  totalValueLockedUSD,
  txCount,
  volumeUSD,
}
`;

export const queryToken = gql`
query queryToken($id: ID!, $block: Block_height) {
  token(id: $id, block: $block) {
    derivedETH
    feesUSD
    id
    name
    symbol
    totalValueLocked
    totalValueLockedUSD
    txCount
    volume
    volumeUSD
  }
}`;

export const queryFactories = gql`
query queryFactories($block: Block_height, $first: Int) {
  factories(first: $first, block: $block) {
    id
    totalFeesUSD
    totalValueLockedUSD
    totalVolumeUSD
    txCount
  }
}`;

export const queryBundles = gql`
query queryBundles($block: Block_height, $first: Int) {
  bundles(first: $first, block: $block) {
    id
    ethPriceUSD
  }
}`;

// Getting Pool by id.
export const queryPoolById = gql`
query queryPoolById($id: ID!) {
  pool(id: $id) 
    ${resultPool}
}`;

export const queryTicks = gql`
query queryTicks($skip: Int, $first: Int, $where: Tick_filter, $block: Block_height) {
  ticks(skip: $skip, first: $first, where: $where, block: $block) {
    id
    liquidityGross
    liquidityNet
    price0
    price1
    tickIdx
  }
}`;

// Getting Pool(s).
export const queryPools = gql`
query queryPools($where: Pool_filter, $first: Int, $orderBy: Pool_orderBy, $orderDirection: OrderDirection) {
  pools(where: $where, first: $first, orderBy: $orderBy, orderDirection: $orderDirection)
    ${resultPool}
}`;

// Getting UniswapDayData(s).
export const queryUniswapDayDatas = gql`
query queryUniswapDayDatas($first: Int, $skip: Int, $orderBy: UniswapDayData_orderBy, $orderDirection: OrderDirection, $where: UniswapDayData_filter) {
  uniswapDayDatas(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection, where: $where) {
    id,
    date,
    tvlUSD,
    volumeUSD
  }
}`;

// Getting PoolDayData(s).
export const queryPoolDayDatas = gql`
query queryPoolDayDatas($first: Int, $skip: Int, $orderBy: PoolDayData_orderBy, $orderDirection: OrderDirection, $where: PoolDayData_filter) {
  poolDayDatas(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection, where: $where) {
    id,
    date,
    tvlUSD,
    volumeUSD
  }
}`;

// Getting TokenDayDatas(s).
export const queryTokenDayDatas = gql`
query queryTokenDayData($first: Int, $skip: Int, $orderBy: TokenDayData_orderBy, $orderDirection: OrderDirection, $where: TokenDayData_filter) {
  tokenDayDatas(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection, where: $where) {
    id,
    date,
    totalValueLockedUSD,
    volumeUSD
  }
}`;

// Getting TokenDayDatas(s).
export const queryTokenHourDatas = gql`
query queryTokenHourData($first: Int, $skip: Int, $orderBy: TokenHourData_orderBy, $orderDirection: OrderDirection, $where: TokenHourData_filter) {
  tokenHourDatas(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection, where: $where) {
    id,
    low,
    high,
    open,
    close,
    periodStartUnix
  }
}`;

// Getting mint(s).
export const queryMints = gql`
query queryMints(
  $first: Int,
  $orderBy: Mint_orderBy,
  $orderDirection: OrderDirection,
  $where: Mint_filter) {
    mints(
      first: $first,
      orderBy: $orderBy,
      orderDirection: $orderDirection,
      where: $where) {
        amount0,
        amount1,
        amountUSD,
        id,
        origin,
        owner,
        sender,
        timestamp,
        pool {
          id
        },
        transaction {
          id
        }
      }
}`;

// Getting burns(s).
export const queryBurns = gql`
query queryBurns(
  $first: Int,
  $orderBy: Burn_orderBy,
  $orderDirection: OrderDirection,
  $where: Burn_filter) {
    burns(
      first: $first,
      orderBy: $orderBy,
      orderDirection: $orderDirection,
      where: $where) {
        amount0,
        amount1,
        amountUSD,
        id,
        origin,
        owner,
        timestamp,
        pool {
          id
        },
        transaction {
          id
        }
      }
}`;

// Getting swap(s) .
export const querySwaps = gql`
query querySwaps(
  $first: Int,
  $orderBy: Swap_orderBy,
  $orderDirection: OrderDirection,
  $where: Swap_filter) {
    swaps(
      first: $first,
      orderBy: $orderBy,
      orderDirection: $orderDirection,
      where: $where) {
        amount0,
        amount1,
        amountUSD,
        id,
        origin,
        timestamp,
        pool {
          id
        },
        transaction {
          id
        }
      }
}`;

// Getting transactions(s).
export const queryTransactions = gql`
query queryTransactions(
  $first: Int,
  $orderBy: Transaction_orderBy,
  $mintOrderBy: Mint_orderBy,
  $burnOrderBy: Burn_orderBy,
  $swapOrderBy: Swap_orderBy,
  $orderDirection: OrderDirection) {
    transactions(
      first: $first,
      orderBy: $orderBy,
      orderDirection: $orderDirection) {
        id,
        mints( first: $first, orderBy: $mintOrderBy, orderDirection: $orderDirection) {
          id,
          timestamp
        },
        burns( first: $first, orderBy: $burnOrderBy, orderDirection: $orderDirection) {
          id,
          timestamp
        },
        swaps( first: $first, orderBy: $swapOrderBy, orderDirection: $orderDirection) {
          id,
          timestamp
        },
        timestamp
      }
}`;

// Getting positions.
export const queryPositions = gql`
query queryPositions($first: Int, $where: Position_filter) {
  positions(first: $first, where: $where) {
    id,
    pool {
      id
    },
    token0 {
      id
    },
    token1 {
      id
    },
    tickLower {
      id
    },
    tickUpper {
      id
    },
    transaction {
      id
    },
    liquidity,
    depositedToken0,
    depositedToken1,
    collectedFeesToken0,
    collectedFeesToken1,
    owner,
    feeGrowthInside0LastX128,
    feeGrowthInside1LastX128
  }
}`;
