import { gql } from 'graphql-request';

export const queryToken = gql`
query queryToken($id: ID!) {
  token(id: $id) {
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

// Getting the first Factory entity.
export const queryFactory = gql`
{
  factories(first: 1) {
    id
    totalFeesUSD
    totalValueLockedUSD
    totalVolumeUSD
    txCount
  }
}`;

// Getting the first Bundle entity.
export const queryBundle = gql`
{
  bundles(first: 1) {
    id
    ethPriceUSD
  }
}`;

// Getting Pool by id.
export const queryPoolById = gql`
query queryPoolById($id: ID!) {
  pool(id: $id) {
    feeTier
    id
    liquidity
    sqrtPrice
    tick
    token0Price
    token1Price
    totalValueLockedToken0
    totalValueLockedToken1
    totalValueLockedUSD
    txCount
    volumeUSD
  }
}`;

// Getting Pool(s) filtered by tokens.
export const queryPoolsByTokens = gql`
query queryPoolsByTokens($tokens: [String!]) {
  pools(where: { token0_in: $tokens, token1_in: $tokens }) {
    id,
    feeTier
  }
}`;

// Getting UniswapDayData(s).
export const queryUniswapDayData = gql`
query queryUniswapDayData($first: Int, $orderBy: UniswapDayData_orderBy, $orderDirection: OrderDirection) {
  uniswapDayDatas(first: $first, orderBy: $orderBy, orderDirection: $orderDirection) {
    id,
    date,
    tvlUSD
  }
}`;

// Getting PoolDayData(s) filtered by pool and ordered by date.
export const queryPoolDayData = gql`
query queryPoolDayData($first: Int, $orderBy: PoolDayData_orderBy, $orderDirection: OrderDirection, $pool: String) {
  poolDayDatas(first: $first, orderBy: $orderBy, orderDirection: $orderDirection, where: { pool: $pool }) {
    id,
    date,
    tvlUSD
  }
}`;

// Getting TokenDayDatas(s) filtered by token and ordered by date.
export const queryTokenDayData = gql`
query queryTokenDayData($first: Int, $orderBy: TokenDayData_orderBy, $orderDirection: OrderDirection, $token: String) {
  tokenDayDatas(first: $first, orderBy: $orderBy, orderDirection: $orderDirection, where: { token: $token }) {
    id,
    date,
    totalValueLockedUSD
  }
}`;

// Getting TokenDayDatas(s) filtered by token and ordered by date.
export const queryTokenHourData = gql`
query queryTokenHourData($first: Int, $orderBy: TokenHourData_orderBy, $orderDirection: OrderDirection, $token: String) {
  tokenHourDatas(first: $first, orderBy: $orderBy, orderDirection: $orderDirection, where: { token: $token }) {
    id,
    low,
    high,
    open,
    close,
    periodStartUnix
  }
}`;

// Getting mint(s) filtered by pool, tokens and ordered by timestamp.
export const queryMints = gql`
query queryMints(
  $first: Int,
  $orderBy: Mint_orderBy,
  $orderDirection: OrderDirection,
  $pool: String,
  $token0: String,
  $token1: String) {
    mints(
      first: $first,
      orderBy: $orderBy,
      orderDirection: $orderDirection,
      where: {
        pool: $pool,
        token0: $token0,
        token1: $token1
      }) {
        amount0
        amount1
        amountUSD
        id
        origin
        owner
        sender
        timestamp
      }
}`;

// Getting burns(s) filtered by pool, tokens and ordered by timestamp.
export const queryBurns = gql`
query queryBurns(
  $first: Int,
  $orderBy: Burn_orderBy,
  $orderDirection: OrderDirection,
  $pool: String,
  $token0: String,
  $token1: String) {
    burns(
      first: $first,
      orderBy: $orderBy,
      orderDirection: $orderDirection,
      where: {
        pool: $pool,
        token0: $token0,
        token1: $token1
      }) {
        amount0
        amount1
        amountUSD
        id
        origin
        owner
        timestamp
      }
}`;

// Getting Tick(s) filtered by pool.
export const queryTicks = gql`
query queryTicksByPool($pool: String) {
  ticks(where: { poolAddress: $pool }) {
    id
    liquidityGross
    liquidityNet
    price0
    price1
    tickIdx
  }
}`;
