# uni-info-watcher

## Instructions

### Setup

Create a postgres12 database for the job queue:

```
sudo su - postgres
createdb uni-info-watcher-job-queue
```

Enable the `pgcrypto` extension on the job queue database (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro).

Example:

```
postgres@tesla:~$ psql -U postgres -h localhost uni-info-watcher-job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

uni-watcher-job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
uni-info-watcher-job-queue=# exit
```

Create a postgres12 database for the uni-info watcher:

```
sudo su - postgres
createdb uni-info-watcher
```

Update `environments/local.toml` with database connection settings for both the databases.

### Run

* Start the server:
  ```bash
  $ yarn server
  ```

* Start the job runner:

  ```bash
  $ yarn job-runner
  ```

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

## Test

### Smoke test

To run a smoke test:

* Start the server in `packages/erc-20-watcher`.
* Start the server and the job-runner in `packages/uni-watcher`.
* Start the server and the job-runner in `packages/uni-info-watcher`.
* Run the smoke test in `packages/uni-watcher` atleast once.
* Run:

  ```bash
  $ yarn smoke-test
  ```
  