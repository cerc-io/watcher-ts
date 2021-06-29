## Queries

- uniswap-v3 endpoint (https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-alt)

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/chartData.ts
    ```
    query poolDayDatas($startTime: Int!, $skip: Int!, $address: Bytes!) {
      poolDayDatas(
        first: 1000
        skip: $skip
        where: { pool: $address, date_gt: $startTime }
        orderBy: date
        orderDirection: asc
      ) {
        date
        volumeUSD
        tvlUSD
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/poolData.ts
    ```
    query pools {
      pools(where: {id_in: $poolString}, block: {number: $block}, orderBy: totalValueLockedUSD, orderDirection: desc) {
        id
        feeTier
        liquidity
        sqrtPrice
        tick
        token0 {
            id
            symbol
            name
            decimals
            derivedETH
        }
        token1 {
            id
            symbol
            name
            decimals
            derivedETH
        }
        token0Price
        token1Price
        volumeUSD
        txCount
        totalValueLockedToken0
        totalValueLockedToken1
        totalValueLockedUSD
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/tickData.ts
    ```
    query surroundingTicks(
      $poolAddress: String!
      $tickIdxLowerBound: BigInt!
      $tickIdxUpperBound: BigInt!
      $skip: Int!
    ) {
      ticks(
        first: 1000
        skip: $skip
        where: { poolAddress: $poolAddress, tickIdx_lte: $tickIdxUpperBound, tickIdx_gte: $tickIdxLowerBound }
      ) {
        tickIdx
        liquidityGross
        liquidityNet
        price0
        price1
      }
    }

    query pool($poolAddress: String!) {
      pool(id: $poolAddress) {
        tick
        token0 {
          symbol
          id
          decimals
        }
        token1 {
          symbol
          id
          decimals
        }
        feeTier
        sqrtPrice
        liquidity
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/topPools.ts
    ```
    query topPools {
      pools(first: 50, orderBy: totalValueLockedUSD, orderDirection: desc) {
        id
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/transactions.ts
    ```
    query transactions($address: Bytes!) {
      mints(first: 100, orderBy: timestamp, orderDirection: desc, where: { pool: $address }) {
        timestamp
        transaction {
          id
        }
        pool {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        owner
        sender
        origin
        amount0
        amount1
        amountUSD
      }
      swaps(first: 100, orderBy: timestamp, orderDirection: desc, where: { pool: $address }) {
        timestamp
        transaction {
          id
        }
        pool {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        origin
        amount0
        amount1
        amountUSD
      }
      burns(first: 100, orderBy: timestamp, orderDirection: desc, where: { pool: $address }) {
        timestamp
        transaction {
          id
        }
        pool {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        owner
        amount0
        amount1
        amountUSD
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/protocol/chart.ts
    ```
    query uniswapDayDatas($startTime: Int!, $skip: Int!) {
      uniswapDayDatas(first: 1000, skip: $skip, where: { date_gt: $startTime }, orderBy: date, orderDirection: asc) {
        id
        date
        volumeUSD
        tvlUSD
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/protocol/overview.ts
    ```
    query uniswapFactories {
      factories(
        block: { number: $block }
        first: 1) {
        txCount
        totalVolumeUSD
        totalFeesUSD
        totalValueLockedUSD
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/protocol/transactions.ts
    ```
    query transactions {
      transactions(first: 500, orderBy: timestamp, orderDirection: desc) {
        id
        timestamp
        mints {
          pool {
            token0 {
              id
              symbol
            }
            token1 {
              id
              symbol
            }
          }
          owner
          sender
          origin
          amount0
          amount1
          amountUSD
        }
        swaps {
          pool {
            token0 {
              id
              symbol
            }
            token1 {
              id
              symbol
            }
          }
          origin
          amount0
          amount1
          amountUSD
        }
        burns {
          pool {
            token0 {
              id
              symbol
            }
            token1 {
              id
              symbol
            }
          }
          owner
          origin
          amount0
          amount1
          amountUSD
        }
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/search/index.ts
    ```
    query tokens($value: String, $id: String) {
      asSymbol: tokens(where: { symbol_contains: $value }, orderBy: totalValueLockedUSD, orderDirection: desc) {
        id
        symbol
        name
        totalValueLockedUSD
      }
      asName: tokens(where: { name_contains: $value }, orderBy: totalValueLockedUSD, orderDirection: desc) {
        id
        symbol
        name
        totalValueLockedUSD
      }
      asAddress: tokens(where: { id: $id }, orderBy: totalValueLockedUSD, orderDirection: desc) {
        id
        symbol
        name
        totalValueLockedUSD
      }
    }

    query pools($tokens: [Bytes]!, $id: String) {
      as0: pools(where: { token0_in: $tokens }) {
        id
        feeTier
        token0 {
          id
          symbol
          name
        }
        token1 {
          id
          symbol
          name
        }
      }
      as1: pools(where: { token1_in: $tokens }) {
        id
        feeTier
        token0 {
          id
          symbol
          name
        }
        token1 {
          id
          symbol
          name
        }
      }
      asAddress: pools(where: { id: $id }) {
        id
        feeTier
        token0 {
          id
          symbol
          name
        }
        token1 {
          id
          symbol
          name
        }
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/chartData.ts
    ```
    query tokenDayDatas($startTime: Int!, $skip: Int!, $address: Bytes!) {
      tokenDayDatas(
        first: 1000
        skip: $skip
        where: { token: $address, date_gt: $startTime }
        orderBy: date
        orderDirection: asc
      ) {
        date
        volumeUSD
        totalValueLockedUSD
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/poolsForToken.ts
    ```
    query topPools($address: Bytes!) {
      asToken0: pools(first: 200, orderBy: totalValueLockedUSD, orderDirection: desc, where: { token0: $address }) {
        id
      }
      asToken1: pools(first: 200, orderBy: totalValueLockedUSD, orderDirection: desc, where: { token1: $address }) {
        id
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/priceData.ts
    ```
    query blocks {
      tBlockTimestamp:token(id:$tokenAddress, block: { number: $blockNumber }) {
        derivedETH
      },
      bBlockTimestamp: bundle(id:"1", block: { number: $blockNumber }) {
        ethPriceUSD
      }
    }

    query tokenHourDatas($startTime: Int!, $skip: Int!, $address: Bytes!) {
      tokenHourDatas(
        first: 100
        skip: $skip
        where: { token: $address, periodStartUnix_gt: $startTime }
        orderBy: periodStartUnix
        orderDirection: asc
      ) {
        periodStartUnix
        high
        low
        open
        close
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/tokenData.ts
    ```
    query tokens {
      tokens(where: {id_in: $tokenString}, block: {number: $block}), orderBy: totalValueLockedUSD, orderDirection: desc) {
        id
        symbol
        name
        derivedETH
        volumeUSD
        volume
        txCount
        totalValueLocked
        feesUSD
        totalValueLockedUSD
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/topTokens.ts
    ```
    query topPools {
      tokens(first: 50, orderBy: totalValueLockedUSD, orderDirection: desc) {
        id
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/transactions.ts
    ```
    query transactions($address: Bytes!) {
      mintsAs0: mints(first: 500, orderBy: timestamp, orderDirection: desc, where: { token0: $address }) {
        timestamp
        transaction {
          id
        }
        pool {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        owner
        sender
        origin
        amount0
        amount1
        amountUSD
      }
      mintsAs1: mints(first: 500, orderBy: timestamp, orderDirection: desc, where: { token0: $address }) {
        timestamp
        transaction {
          id
        }
        pool {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        owner
        sender
        origin
        amount0
        amount1
        amountUSD
      }
      swapsAs0: swaps(first: 500, orderBy: timestamp, orderDirection: desc, where: { token0: $address }) {
        timestamp
        transaction {
          id
        }
        pool {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        origin
        amount0
        amount1
        amountUSD
      }
      swapsAs1: swaps(first: 500, orderBy: timestamp, orderDirection: desc, where: { token1: $address }) {
        timestamp
        transaction {
          id
        }
        pool {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        origin
        amount0
        amount1
        amountUSD
      }
      burnsAs0: burns(first: 500, orderBy: timestamp, orderDirection: desc, where: { token0: $address }) {
        timestamp
        transaction {
          id
        }
        pool {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        owner
        amount0
        amount1
        amountUSD
      }
      burnsAs1: burns(first: 500, orderBy: timestamp, orderDirection: desc, where: { token1: $address }) {
        timestamp
        transaction {
          id
        }
        pool {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        owner
        amount0
        amount1
        amountUSD
      }
    }
    ```

  * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/hooks/useEthPrices.ts
    ```
    query prices($block24: Int!, $block48: Int!, $blockWeek: Int!) {
      current: bundles(first: 1) {
        ethPriceUSD
      }
      oneDay: bundles(first: 1, block: { number: $block24 }) {
        ethPriceUSD
      }
      twoDay: bundles(first: 1, block: { number: $block48 }) {
        ethPriceUSD
      }
      oneWeek: bundles(first: 1, block: { number: $blockWeek }) {
        ethPriceUSD
      }
    }
    ```

- ethereum-blocks endpoint (https://api.thegraph.com/subgraphs/name/blocklytics/ethereum-blocks)

  https://github.com/Uniswap/uniswap-v3-info/blob/master/src/hooks/useBlocksFromTimestamps.ts
  ```
  query blocks {
    tTimestamp1:blocks(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_gt: $timestamp1, timestamp_lt: $timestamp1Plus600 }) {
      number
    }

    tTimestamp2:blocks(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_gt: $timestamp2, timestamp_lt: $timestamp2Plus600 }) {
      number
    }
  }
  ```

- Checking subgraph health (https://thegraph.com/docs/deploy-a-subgraph#checking-subgraph-health)

  https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/application/index.ts
  ```
  query health {
    indexingStatusForCurrentVersion(subgraphName: "uniswap/uniswap-v2") {
      synced
      health
      chains {
        chainHeadBlock {
          number
        }
        latestBlock {
          number
        }
      }
    }
  }
  ```