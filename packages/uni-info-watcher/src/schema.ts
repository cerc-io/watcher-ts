//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from '@apollo/client/core';

export default gql`
scalar BigDecimal

scalar BigInt

scalar Bytes

input Block_height {
  hash: Bytes
  number: Int
}

type Pool {
  feeTier: BigInt!
  id: ID!
  liquidity: BigInt!
  sqrtPrice: BigInt!
  tick: BigInt
  token0: Token!
  token0Price: BigDecimal!
  token1: Token!
  token1Price: BigDecimal!
  totalValueLockedToken0: BigDecimal!
  totalValueLockedToken1: BigDecimal!
  totalValueLockedUSD: BigDecimal!
  txCount: BigInt!
  volumeUSD: BigDecimal!
}

type PoolDayData {
  date: Int!
  id: ID!
  tvlUSD: BigDecimal!
  volumeUSD: BigDecimal!
}

type Tick {
  id: ID!
  liquidityGross: BigInt!
  liquidityNet: BigInt!
  price0: BigDecimal!
  price1: BigDecimal!
  tickIdx: BigInt!
}

type Mint {
  amount0: BigDecimal!
  amount1: BigDecimal!
  amountUSD: BigDecimal
  id: ID!
  origin: Bytes!
  owner: Bytes!
  pool: Pool!
  sender: Bytes
  timestamp: BigInt!
  transaction: Transaction!
}

type Swap {
  amount0: BigDecimal!
  amount1: BigDecimal!
  amountUSD: BigDecimal!
  id: ID!
  origin: Bytes!
  pool: Pool!
  timestamp: BigInt!
  transaction: Transaction!
}

type Burn {
  amount0: BigDecimal!
  amount1: BigDecimal!
  amountUSD: BigDecimal
  id: ID!
  origin: Bytes!
  owner: Bytes
  pool: Pool!
  timestamp: BigInt!
  transaction: Transaction!
}

type UniswapDayData {
  date: Int!
  id: ID!
  tvlUSD: BigDecimal!
  volumeUSD: BigDecimal!
}

type Factory {
  id: ID!
  totalFeesUSD: BigDecimal!
  totalValueLockedUSD: BigDecimal!
  totalVolumeUSD: BigDecimal!
  txCount: BigInt!
}

type Transaction {
  burns(skip: Int = 0, first: Int = 100, orderBy: Burn_orderBy, orderDirection: OrderDirection, where: Burn_filter): [Burn]!
  id: ID!
  mints(skip: Int = 0, first: Int = 100, orderBy: Mint_orderBy, orderDirection: OrderDirection, where: Mint_filter): [Mint]!
  swaps(skip: Int = 0, first: Int = 100, orderBy: Swap_orderBy, orderDirection: OrderDirection, where: Swap_filter): [Swap]!
  timestamp: BigInt!
}

type Token {
  derivedETH: BigDecimal!
  feesUSD: BigDecimal!
  id: ID!
  name: String!
  symbol: String!
  totalValueLocked: BigDecimal!
  totalValueLockedUSD: BigDecimal!
  txCount: BigInt!
  volume: BigDecimal!
  volumeUSD: BigDecimal!
}

type TokenDayData {
  date: Int!
  id: ID!
  totalValueLockedUSD: BigDecimal!
  volumeUSD: BigDecimal!
}

type Bundle {
  ethPriceUSD: BigDecimal!
  id: ID!
}

type TokenHourData {
  close: BigDecimal!
  high: BigDecimal!
  id: ID!
  low: BigDecimal!
  open: BigDecimal!
  periodStartUnix: Int!
}

type Position {
  id: ID!
  pool: Pool!
  token0: Token!
  token1: Token!
  tickLower: Tick!
  tickUpper: Tick!
  transaction: Transaction!
  liquidity: BigInt!
  depositedToken0: BigDecimal!
  depositedToken1: BigDecimal!
  collectedFeesToken0: BigDecimal!
  collectedFeesToken1: BigDecimal!
  owner: Bytes!
  feeGrowthInside0LastX128: BigInt!
  feeGrowthInside1LastX128: BigInt!
}

enum OrderDirection {
  asc
  desc
}

input PoolDayData_filter {
  date_gt: Int
  pool: String
}

enum PoolDayData_orderBy {
  date
}

input Pool_filter {
  id: ID
  id_in: [ID!]
  token0: String
  token0_in: [String!]
  token1: String
  token1_in: [String!]
}

enum Pool_orderBy {
  totalValueLockedUSD
}

input Tick_filter {
  poolAddress: String
  tickIdx_gte: BigInt
  tickIdx_lte: BigInt
}

input Mint_filter {
  pool: String
  token0: String
  token1: String
}

enum Mint_orderBy {
  timestamp
}

input Swap_filter {
  pool: String
  token0: String
  token1: String
}

enum Swap_orderBy {
  timestamp
}

input Burn_filter {
  pool: String
  token0: String
  token1: String
}

enum Burn_orderBy {
  timestamp
}

enum UniswapDayData_orderBy {
  date
}

input UniswapDayData_filter {
  date_gt: Int
}

enum Transaction_orderBy {
  timestamp
}

input Token_filter {
  id: ID
  id_in: [ID!]
  name_contains: String
  symbol_contains: String
}

enum Token_orderBy {
  totalValueLockedUSD
}

input TokenDayData_filter {
  date_gt: Int
  token: String
}

enum TokenDayData_orderBy {
  date
}

input TokenHourData_filter {
  periodStartUnix_gt: Int
  token: String
}

enum TokenHourData_orderBy {
  periodStartUnix
}

input Position_filter {
  id: ID
}

type Query {
  bundle(
    id: ID!

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height
  ): Bundle

  bundles(
    first: Int = 100

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height
  ): [Bundle!]!

  burns(
    first: Int = 100
    orderBy: Burn_orderBy
    orderDirection: OrderDirection
    where: Burn_filter
  ): [Burn!]!

  factories(
    first: Int = 100

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height
  ): [Factory!]!

  mints(
    first: Int = 100
    orderBy: Mint_orderBy
    orderDirection: OrderDirection
    where: Mint_filter
  ): [Mint!]!

  pool(
    id: ID!
  ): Pool

  poolDayDatas(
    skip: Int = 0
    first: Int = 100
    orderBy: PoolDayData_orderBy
    orderDirection: OrderDirection
    where: PoolDayData_filter
  ): [PoolDayData!]!

  pools(
    first: Int = 100
    orderBy: Pool_orderBy
    orderDirection: OrderDirection
    where: Pool_filter

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height
  ): [Pool!]!

  swaps(
    first: Int = 100
    orderBy: Swap_orderBy
    orderDirection: OrderDirection
    where: Swap_filter
  ): [Swap!]!

  ticks(
    skip: Int = 0
    first: Int = 100
    where: Tick_filter

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height
  ): [Tick!]!

  token(
    id: ID!

    """
    The block at which the query should be executed. Can either be an '{ number:
    Int }' containing the block number or a '{ hash: Bytes }' value containing a
    block hash. Defaults to the latest block when omitted.
    """
    block: Block_height
  ): Token

  tokenDayDatas(
    skip: Int = 0
    first: Int = 100
    orderBy: TokenDayData_orderBy
    orderDirection: OrderDirection
    where: TokenDayData_filter
  ): [TokenDayData!]!

  tokenHourDatas(
    skip: Int = 0
    first: Int = 100
    orderBy: TokenHourData_orderBy
    orderDirection: OrderDirection
    where: TokenHourData_filter
  ): [TokenHourData!]!

  tokens(
    orderBy: Token_orderBy
    orderDirection: OrderDirection
    where: Token_filter
  ): [Token!]!

  transactions(
    first: Int = 100
    orderBy: Transaction_orderBy
    orderDirection: OrderDirection
  ): [Transaction!]!

  uniswapDayDatas(
    skip: Int = 0
    first: Int = 100
    orderBy: UniswapDayData_orderBy
    orderDirection: OrderDirection
    where: UniswapDayData_filter
  ): [UniswapDayData!]!

  positions(
    first: Int = 100
    where: Position_filter
  ): [Position!]!
}
`;
