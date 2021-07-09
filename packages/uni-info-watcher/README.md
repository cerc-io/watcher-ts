# uni-info-watcher

## Instructions

* To start the server run `yarn server`.

* Run `yarn server:mock` to run server with mock data.

## Mock Queries

```graphql
{
  bundle(id: "1", block: { number: 2 }) {
    id
    ethPriceUSD
  }

	bundles(first: 1, block: { number: 2 }) {
    id
    ethPriceUSD
  }

  burns(first: 2, orderBy: timestamp) {
    amount0
    amount1
    amountUSD
    id
    origin
    owner
    pool {
      id
    }
    timestamp
    transaction {
      id
    }
  }

  factories(first: 1, block: { number: 2 }) {
    id
    totalFeesUSD
    totalValueLockedUSD
    totalVolumeUSD
    txCount
  }

  mints(first: 2) {
    amount0
    amount1
    amountUSD
    id
    origin
    owner
    pool {
      id
    }
    timestamp
    transaction {
      id
    }
    sender
  }

  pools(first: 2, block: { number:2 }) {
    feeTier
    id
    liquidity
    sqrtPrice
    tick
    token0 {
      name
    }
    token0Price
    token1 {
      name
    }
    token1Price
    totalValueLockedToken0
    totalValueLockedToken1
    totalValueLockedUSD
    txCount
    volumeUSD
  }

  tokens {
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

  transactions(first: 2) {
    burns {
      id
    }
    id
    mints {
      id
    }
    swaps{
    	id
    }
    timestamp
  }

  swaps(first: 2) {
    amount0
    amount1
    amountUSD
    id
    origin
    pool {
      id
    }
    timestamp
    transaction {
      id
    }
  }

  poolDayDatas(skip: 1, first: 2) {
	  date
    id
    tvlUSD
    volumeUSD
  }

  tokenDayDatas(first: 2, where: {}) {
	  date
    id
    totalValueLockedUSD
    volumeUSD
  }

  uniswapDayDatas(skip:1, first: 2) {
      date
      id
      tvlUSD
      volumeUSD
  }

  ticks(skip: 1, first: 2, block: { number: 2 }) {
    id
    liquidityGross
    liquidityNet
    price0
    price1
    tickIdx
  }

  tokenHourDatas(skip: 1, first: 2) {
    close
    high
    id
    low
    open
    periodStartUnix
  }
}
```

Queries with ID param
```graphql
{
  pool(id: "0x38bb4e5eb41aeaeec59e60ba075298f4d4dfd2a2") {
    feeTier
    id
    liquidity
    sqrtPrice
    tick
    token0 {
      name
    }
    token0Price
    token1 {
      name
    }
    token1Price
    totalValueLockedToken0
    totalValueLockedToken1
    totalValueLockedUSD
    txCount
    volumeUSD
  }

  token(id: "0xb87ddd8af3242e56e52318bacf27fe9dcc75c15a", block: { number:2}) {
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
}
```

## Scripts

* **generate:schema**

  Generate schema for uniswap subgraph in graphql format. The `get-graphql-schema` tool is used to generate the schema (https://github.com/prisma-labs/get-graphql-schema). The uniswap subgraph graphql endpoint is provided in the script to generate the schema.

* **lint:schema**

  Lint schema graphql files:

  ```bash
  $ yarn lint:schema docs/analysis/schema/frontend.graphql
  ```
