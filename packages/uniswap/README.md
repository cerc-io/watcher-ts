# Uniswap

## Scripts

* **generate:schema**

  Generate schema for uniswap subgraph in graphql format. The `get-graphql-schema` tool is used to generate the schema (https://github.com/prisma-labs/get-graphql-schema). The uniswap subgraph graphql endpoint is provided in the script to generate the schema.

* **lint:schema**

  Lint schema graphql files.
  ```bash
  $ yarn lint:schema frontend-schema.graphql
  ```

## View Methods in Uniswap V3 Core

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/NoDelegateCall.sol
  - checkNotDelegateCall (private)

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/UniswapV3Pool.sol#L158
  - _blockTimestamp (internal)
  - balance0 (private)
  - balance1 (private)
  - snapshotCumulativesInside (external)
  - observe (external)

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/Oracle.sol
  - binarySearch (private)
  - getSurroundingObservations (private)
  - observeSingle (internal)
  - observe (internal)

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/Position.sol
  - get (internal)

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/Tick.sol
  - getFeeGrowthInside (internal)

* https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/TickBitmap.sol
  - nextInitializedTickWithinOneWord (internal)

## Queries in Uniswap subgraph frontend
Actual queries are listed in [queries](./queries.md) file.

- uniswap-v3 endpoint (https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-alt)
  * PoolDayData
    - poolDayDatas (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/chartData.ts)

  * Pool
    - pools
      * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/poolData.ts
      * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/topPools.ts
      * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/search/index.ts
      * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/poolsForToken.ts
    - pool
      * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/tickData.ts

  * Tick
    -  tick (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/tickData.ts)

  * Mint
    - mints
      * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/pools/transactions.ts
      * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/transactions.ts

  * UniswapDayData
    - uniswapDayDatas (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/protocol/chart.ts)

  * Factory
    - factories (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/protocol/overview.ts)

  * Transaction
    - transactions (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/protocol/transactions.ts)

  * Token
    - tokens
      * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/search/index.ts
      * (queried by block) https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/tokenData.ts
      * https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/topTokens.ts
    - token queried by block (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/priceData.ts)

  * TokenDayData
    - tokenDayDatas (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/chartData.ts)

  * Bundle
    - bundle queried by block (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/priceData.ts)
    - bundles (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/hooks/useEthPrices.ts)

  * TokenHourData
    - tokenHourDatas (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/priceData.ts)

  * Swap
    - swaps (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/transactions.ts)

  * Burn
    - burns (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/tokens/transactions.ts)

- ethereum-blocks endpoint (https://api.thegraph.com/subgraphs/name/blocklytics/ethereum-blocks)

  t${timestamp}:blocks (https://github.com/Uniswap/uniswap-v3-info/blob/master/src/hooks/useBlocksFromTimestamps.ts)

- Checking subgraph health (https://thegraph.com/docs/deploy-a-subgraph#checking-subgraph-health)

  https://github.com/Uniswap/uniswap-v3-info/blob/master/src/data/application/index.ts#L5

## Mapping Event handlers in Uniswap subgraph

* handlePoolCreated (Factory contract - PoolCreated event)
  - Data from event
  - Entities
    * Factory
    * Bundle
    * Pool
    * Token
  - Contract calls
    * ERC20 (symbol, name, totalSupply, decimals)
    * ERC20SymbolBytes (symbol)
    * ERC20NameBytes (name)
  - Create new Template contract (Pool)

* NonfungiblePositionManager contract
  - Handlers (Similar code)
    * handleIncreaseLiquidity (IncreaseLiquidity event)
    * handleDecreaseLiquidity (DecreaseLiquidity event)
    * handleCollect (Collect event)
    * handleTransfer (Transfer event)
  - Data from event
  - Entities
    * Position
    * Transaction
    * Token
  - Contract calls
    * NonfungiblePositionManager (positions)
    * Factory (getPool)

* handleInitialize (Pool contract - Initialize event)
  - Data from event
  - Entities
    * Pool
    * Token
    * Bundle
    * PoolDayData
    * PoolHourData

* handleSwap (Pool contract - Swap event)
  - Data from event
  - Entities
    * Bundle
    * Factory
    * Pool
    * Token
    * Transaction
    * Swap
    * UniswapDayData
    * PoolDayData
    * PoolHourData
    * TokenDayData
    * TokenHourData
  - Contract calls
    * Pool (feeGrowthGlobal0X128, feeGrowthGlobal1X128)

* handleMint (Pool contract - Mint event)
  - Data from event
  - Entities
    * Bundle
    * Pool
    * Factory
    * Token
    * Transaction
    * Mint
    * Tick
    * UniswapDayData
    * PoolDayData
    * PoolHourData
    * TokenDayData
    * TokenHourData

* handleBurn (Pool contract - Burn event)
  - Data from event
  - Entities
    * Bundle
    * Pool
    * Factory
    * Token
    * Burn
    * Tick
    * UniswapDayData
    * PoolDayData
    * PoolHourData
    * TokenDayData
    * TokenHourData
  - Extra methods
    * store.remove (remove Tick entity)

## References

* https://github.com/Uniswap/uniswap-v3-core
