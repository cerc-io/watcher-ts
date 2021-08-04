import { gql } from 'graphql-request';

export const queryToken = gql`
query queryToken($id: ID!) {
  token(id: $id) {
    id
  }
}`;

// Getting the first Factory entity.
export const queryFactory = gql`
{
  factories(first: 1) {
    id
  }
}`;

// Getting the first Bundle entity.
export const queryBundle = gql`
{
  bundles(first: 1) {
    id
  }
}`;

// Getting Pool by id.
export const queryPoolById = gql`
query queryPoolById($id: ID!) {
  pool(id: $id) {
    id,
    sqrtPrice,
    tick,
    totalValueLockedUSD
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

// Getting PoolDayData(s) filtered by pool and ordered by date.
export const queryPoolDayData = gql`
query queryPoolDayData($first: Int, $orderBy: PoolDayData_orderBy, $orderDirection: OrderDirection, $pool: String) {
  poolDayDatas(first: $first, orderBy: $orderBy, orderDirection: $orderDirection, where: { pool: $pool }) {
    id,
    date,
    tvlUSD
  }
}`;
