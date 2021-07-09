# Contract Analysis

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
