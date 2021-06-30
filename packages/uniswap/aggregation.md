# Aggregation in Entities

- Pool
  * id (pool address)
    - Factory PoolCreated event
      ```ts
      let pool = new Pool(event.params.pool.toHexString()) as Pool
      ```

  * feeTier (fee amount)
    - Factory PoolCreated event
      ```ts
      pool.feeTier = BigInt(event.params.fee)
      ```

  * sqrtPrice (current price tracker)
    - Pool Initialize event, Swap event
      ```ts
      pool.sqrtPrice = event.params.sqrtPriceX96
      ```

  * tick (current tick)
    - Pool Initialize event, Swap event
      ```ts
      pool.tick = BigInt(event.params.tick)
      ```

  * token0Price (token0 per token1), token1Price(token1 per token0)
    - Pool Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0 as Token, token1 as Token)
      pool.token0Price = prices[0]
      pool.token1Price = prices[1]
      ```
      * sqrtPriceX96ToTokenPrices (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/pricing.ts#L39)
        - Uses Token entity `decimals` field

  * totalValueLockedToken0 (total token 0 across all ticks), totalValueLockedToken1 (total token 1 across all ticks)
    - Pool Mint event, Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)
      pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0)
      pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1)
      ```
      * convertTokenToDecimal (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/index.ts#L72)

    - Pool Burn event
      ```ts
      pool.totalValueLockedToken0 = pool.totalValueLockedToken0.minus(amount0)
      pool.totalValueLockedToken1 = pool.totalValueLockedToken1.minus(amount1)
      ```

  * totalValueLockedUSD (tvl USD)
    - Pool Initialize event, Burn event, Swap event
      ```ts
      let bundle = Bundle.load('1')
      let pool = Pool.load(event.address.toHexString())
      pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD)
      ```

  * totalValueLockedETH (tvl derived ETH)
    - Pool Mint event, Burn event, Swap event
      ```ts
      let pool = Pool.load(poolAddress)
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)

      pool.totalValueLockedETH = pool.totalValueLockedToken0
        .times(token0.derivedETH)
        .plus(pool.totalValueLockedToken1.times(token1.derivedETH))
      ```

  * txCount (all time number of transactions)
    - Pool Mint event, Burn event, Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())

      // Constant ONE_BI is BigInt.fromI32(1)
      pool.txCount = pool.txCount.plus(ONE_BI)
      ```

  * volumeUSD (all time USD swapped)
    - Pool Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)

      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      let amount0Abs = amount0
      // Constant ZERO_BD is BigDecimal.fromString('0')
      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }
      let amount1Abs = amount1
      if (amount1.lt(ZERO_BD)) {
        amount1Abs = amount1.times(BigDecimal.fromString('-1'))
      }

      let amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0 as Token, amount1Abs, token1 as Token).div(
        BigDecimal.fromString('2')
      )

      pool.volumeUSD = pool.volumeUSD.plus(amountTotalUSDTracked)
      ```
      * getTrackedAmountUSD (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/pricing.ts#L110)
        - Uses Bundle entity `ethPriceUSD` field
        - Uses Token entity `derivedEth` field

      * convertTokenToDecimal (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/index.ts#L72)

  * liquidity (in range liquidity)
    - Pool Mint event
      ```ts
      let pool = Pool.load(event.address.toHexString())

      if (
        pool.tick !== null &&
        BigInt.fromI32(event.params.tickLower).le(pool.tick as BigInt) &&
        BigInt.fromI32(event.params.tickUpper).gt(pool.tick as BigInt)
      ) {
        pool.liquidity = pool.liquidity.plus(event.params.amount)
      }
      ```

- Token
  * id (pool address)
    - Factory PoolCreated event
      ```ts
      let token0 = Token.load(event.params.token0.toHexString())
      ```

  * decimals (token decimals)
    - Factory PoolCreated event
      ```ts
      let token0 = Token.load(event.params.token0.toHexString())
      let decimals = fetchTokenDecimals(event.params.token0)
      token0.decimals = decimals
      ```
      * fetchTokenDecimals(https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/token.ts#L75)
        - Uses ERC20 contract view method call `decimals`

  * derivedETH (derived price in ETH)
    - Pool Initialize event, Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      token0.derivedETH = findEthPerToken(token0 as Token)
      ```
      * findEthPerToken (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/pricing.ts#L65)
        - Uses Token entity `whitelistPools` field
        - Uses Pool entity `liquidity`, `totalValueLockedToken1`, `token0Price` fields

  * whitelistPools (pools token is in that are white listed for USD pricing)
    - Factory PoolCreated event
      ```ts
      let pool = new Pool(event.params.pool.toHexString()) as Pool
      let token1 = Token.load(event.params.token1.toHexString())

      if (WHITELIST_TOKENS.includes(token0.id)) {
        let newPools = token1.whitelistPools
        newPools.push(pool.id)
        token1.whitelistPools = newPools
      }
      ```
      * Constant WHITELIST_TOKENS (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/pricing.ts#L12)

  * feesUSD (fees in USD)
    - Pool Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      let amount0Abs = amount0
      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }
      let amount1Abs = amount1
      if (amount1.lt(ZERO_BD)) {
        amount1Abs = amount1.times(BigDecimal.fromString('-1'))
      }

      let amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0 as Token, amount1Abs, token1 as Token).div(
        BigDecimal.fromString('2')
      )

      let feesUSD = amountTotalUSDTracked.times(pool.feeTier.toBigDecimal()).div(BigDecimal.fromString('1000000'))
      token0.feesUSD = token0.feesUSD.plus(feesUSD)
      ```

  * totalValueLocked (liquidity across all pools in token units)
    - Pool Mint event, Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      token0.totalValueLocked = token0.totalValueLocked.plus(amount0)
      ```

    - Pool Burn event
      ```ts
      token0.totalValueLocked = token0.totalValueLocked.minus(amount0)
      ```

  * totalValueLockedUSD (liquidity across all pools in derived USD)
    - Pool Mint event, Burn event, Swap event
      ```ts
      let bundle = Bundle.load('1')
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD))
      ```

  * txCount (transactions across all pools that include this token)
    - Pool Mint event, Burn event, Swap event
      ```ts
      token0.txCount = token0.txCount.plus(ONE_BI)
      ```

  * volume (volume in token units)
    - Pool Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount0Abs = amount0

      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }

      token0.volume = token0.volume.plus(amount0Abs)
      ```

  * volumeUSD (volume in derived USD)
    - Pool Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      let amount0Abs = amount0
      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }
      let amount1Abs = amount1
      if (amount1.lt(ZERO_BD)) {
        amount1Abs = amount1.times(BigDecimal.fromString('-1'))
      }

      let amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0 as Token, amount1Abs, token1 as Token).div(
        BigDecimal.fromString('2')
      )

      token0.volumeUSD = token0.volumeUSD.plus(amountTotalUSDTracked)
      ```

- Factory
  * id (factory address)
    - Factory PoolCreated event
      ```ts
      let factory = Factory.load(FACTORY_ADDRESS)
      ```
      * Constant FACTORY_ADDRESS is in https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/constants.ts#L6

  * totalFeesUSD (total swap fees all time in USD)
    - Pool Swap event
      ```ts
      let factory = Factory.load(FACTORY_ADDRESS)
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      let amount0Abs = amount0
      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }
      let amount1Abs = amount1
      if (amount1.lt(ZERO_BD)) {
        amount1Abs = amount1.times(BigDecimal.fromString('-1'))
      }

      let amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0 as Token, amount1Abs, token1 as Token).div(
        BigDecimal.fromString('2')
      )

      let feesUSD = amountTotalUSDTracked.times(pool.feeTier.toBigDecimal()).div(BigDecimal.fromString('1000000'))
      factory.totalFeesUSD = factory.totalFeesUSD.plus(feesUSD)
      ```

  * totalValueLockedUSD (TVL derived in USD)
    - Pool Mint event, Burn event, Swap event
      ```ts
      let bundle = Bundle.load('1')
      let factory = Factory.load(FACTORY_ADDRESS)
      factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD)
      ```

  * totalValueLockedETH (TVL derived in ETH)
    - Pool Mint event, Burn event, Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let factory = Factory.load(FACTORY_ADDRESS)
      factory.totalValueLockedETH = factory.totalValueLockedETH.minus(pool.totalValueLockedETH)

      // After change in pool.totalValueLockedETH
      factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH)
      ```

  * totalVolumeUSD (total volume all time in derived USD)
    - Pool Swap event
      ```ts
      let factory = Factory.load(FACTORY_ADDRESS)
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      let amount0Abs = amount0
      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }
      let amount1Abs = amount1
      if (amount1.lt(ZERO_BD)) {
        amount1Abs = amount1.times(BigDecimal.fromString('-1'))
      }

      let amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0 as Token, amount1Abs, token1 as Token).div(
        BigDecimal.fromString('2')
      )

      factory.totalVolumeUSD = factory.totalVolumeUSD.plus(amountTotalUSDTracked)
      ```

  * txCount (amount of transactions all time)
    - Pool Mint event, Burn event, Swap event
      ```ts
      let factory = Factory.load(FACTORY_ADDRESS)
      factory.txCount = factory.txCount.plus(ONE_BI)
      ```

- Bundle
  Stores for USD calculations.
  * id - Stores only one instance.
    ```ts
    let bundle = Bundle.load('1')
    ```

  * ethPriceUSD (price of ETH in usd)
    - Pool Initialize event, Swap event
      ```ts
      bundle.ethPriceUSD = getEthPriceInUSD()
      ```
      * getEthPriceInUSD (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/pricing.ts#L51)
        - Uses Pool entity `token0Price` field

- Tick
  * id (format: `<pool address>#<tick index>`)
    - Pool Mint event
    ```ts
    let poolAddress = event.address.toHexString()
    let pool = Pool.load(poolAddress)
    let lowerTickIdx = event.params.tickLower
    let lowerTickId = poolAddress + '#' + BigInt.fromI32(event.params.tickLower).toString()
    let lowerTick = Tick.load(lowerTickId)

    if (lowerTick === null) {
      lowerTick = createTick(lowerTickId, lowerTickIdx, pool.id, event)
    }
    ```
    * createTick (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/tick.ts#L8)

  * liquidityGross (total liquidity pool has as tick lower or upper)
    - Pool Mint event
      ```ts
      lowerTick.liquidityGross = lowerTick.liquidityGross.plus(event.params.amount)
      ```

    - Pool Burn event
      ```ts
      lowerTick.liquidityGross = lowerTick.liquidityGross.minus(event.params.amount)
      ```

  * liquidityNet (how much liquidity changes when tick crossed)
    - Pool Mint event
      ```ts
      lowerTick.liquidityNet = lowerTick.liquidityNet.plus(event.params.amount)
      ```

    - Pool Burn event
      ```ts
      lowerTick.liquidityNet = lowerTick.liquidityNet.minus(event.params.amount)
      ```

  * price0 (calculated price of token0 of tick within this pool - constant)
    - Pool Mint event
      ```ts
      lowerTick = createTick(lowerTickId, lowerTickIdx, pool.id, event)

      // Inside createTick
      // tickIdx = lowerTickIdx
      tick.price0 = bigDecimalExponated(BigDecimal.fromString('1.0001'), BigInt.fromI32(tickIdx))
      ```

  * price1 (calculated price of token0 of tick within this pool - constant)
    - Pool Mint event
      ```ts
      lowerTick = createTick(lowerTickId, lowerTickIdx, pool.id, event)

      // Inside createTick
      // tickIdx = lowerTickIdx
      let price0 = bigDecimalExponated(BigDecimal.fromString('1.0001'), BigInt.fromI32(tickIdx))
      tick.price1 = safeDiv(ONE_BD, price0)
      ```

  * tickIdx (tick index)
    - Pool Mint event
      ```ts
      lowerTick = createTick(lowerTickId, lowerTickIdx, pool.id, event)

      // Inside createTick
      // tickIdx = lowerTickIdx
      tick.tickIdx = BigInt.fromI32(tickIdx)
      ```

- Mint
  * id (transaction hash + "#" + index in mints Transaction array)
    - Pool Mint event
      ```ts
      let mint = new Mint(transaction.id.toString() + '#' + pool.txCount.toString())
      ```

  * amount0 (amount of token 0 minted), amount1 (amount of token 1 minted)
    - Pool Mint event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      mint.amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      mint.amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)
      ```

  * amountUSD (derived amount based on available prices of tokens)
    - Pool Mint event
      ```ts
      let bundle = Bundle.load('1')
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      mint.amountUSD = amount0
        .times(token0.derivedETH.times(bundle.ethPriceUSD))
        .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)))
      ```

  * origin (txn origin)
    - Pool Mint event
      ```ts
      mint.origin = event.transaction.from
      ```

  * owner (owner of position where liquidity minted to)
    - Pool Mint event
      ```ts
      mint.owner = event.params.owner
      ```

  * pool (pool position is within)
    - Pool Mint event
      ```ts
      let poolAddress = event.address.toHexString()
      let pool = Pool.load(poolAddress)
      mint.pool = pool.id
      ```

  * sender (the address that minted the liquidity)
    - Pool Mint event
      ```ts
      mint.sender = event.params.sender
      ```

  * timestamp (time of txn)
    - Pool Mint event
      ```ts
      let transaction = loadTransaction(event)
      mint.timestamp = transaction.timestamp
      ```
      * loadTransaction (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/index.ts#L83)
        - Uses Transaction entity

  * transaction (which txn the mint was included in)
    - Pool Mint event
      ```ts
      let transaction = loadTransaction(event)
      mint.transaction = transaction.id
      ```

- Burn
  * id (transaction hash + "#" + index in mints Transaction array)
    - Pool Burn event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let transaction = loadTransaction(event)
      let mint = new Burn(transaction.id + '#' + pool.txCount.toString())
      ```

  * amount0 (amount of token 0 burned), amount1 (amount of token 1 burned)
    - Pool Burn event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      burn.amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      burn.amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)
      ```

  * amountUSD (derived amount based on available prices of tokens)
    - Pool Burn event
      ```ts
      let bundle = Bundle.load('1')
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      burn.amountUSD = amount0
        .times(token0.derivedETH.times(bundle.ethPriceUSD))
        .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)))
      ```

  * origin (txn origin)
    - Pool Burn event
      ```ts
      burn.origin = event.transaction.from
      ```

  * owner (owner of position where liquidity was burned)
    - Pool Burn event
      ```ts
      burn.owner = event.params.owner
      ```

  * pool (pool position is within)
    - Pool Burn event
      ```ts
      let poolAddress = event.address.toHexString()
      let pool = Pool.load(poolAddress)
      burn.pool = pool.id
      ```

  * timestamp (need this to pull recent txns for specific token or pool)
    - Pool Burn event
      ```ts
      let transaction = loadTransaction(event)
      burn.timestamp = transaction.timestamp
      ```

  * transaction (txn burn was included in)
    - Pool Burn event
      ```ts
      let transaction = loadTransaction(event)
      burn.transaction = transaction.id
      ```

- Swap
  * id (transaction hash + "#" + index in swaps Transaction array)
    - Pool Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let transaction = loadTransaction(event)
      let swap = new Swap(transaction.id + '#' + pool.txCount.toString())
      ```

  * amount0 (allow indexing by tokens), amount1 (allow indexing by tokens)
    - Pool Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      swap.amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      swap.amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)
      ```

  * amountUSD (derived info)
    - Pool Swap event
      ```ts
      let bundle = Bundle.load('1')
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)

      let amount0Abs = amount0
      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }
      let amount1Abs = amount1
      if (amount1.lt(ZERO_BD)) {
        amount1Abs = amount1.times(BigDecimal.fromString('-1'))
      }

      let amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0 as Token, amount1Abs, token1 as Token).div(
        BigDecimal.fromString('2')
      )

      swap.amountUSD = amountTotalUSDTracked
      ```

  * origin (txn origin, the EOA that initiated the txn)
    - Pool Swap event
      ```ts
      swap.origin = event.transaction.from
      ```

  * pool (pool swap occured within)
    - Pool Swap event
      ```ts
      let poolAddress = event.address.toHexString()
      let pool = Pool.load(poolAddress)
      swap.pool = pool.id
      ```

  * timestamp (timestamp of transaction)
    - Pool Swap event
      ```ts
      let transaction = loadTransaction(event)
      swap.timestamp = transaction.timestamp
      ```

  * transaction (pointer to transaction)
    - Pool Swap event
      ```ts
      let transaction = loadTransaction(event)
      swap.transaction = transaction.id
      ```

- Transaction
  * id (txn hash)
    - Pool Mint event, Burn event, Swap event
      NonfungiblePositionManager IncreaseLiquidity event, DecreaseLiquidity event, Collect event, Transfer event
      ```ts
      let transaction = loadTransaction(event)

      // Inside loadTransaction
      let transaction = Transaction.load(event.transaction.hash.toHexString())
      if (transaction === null) {
        transaction = new Transaction(event.transaction.hash.toHexString())
      }
      ```
      * loadTransaction (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/index.ts#L83)

  * timestamp (timestamp txn was confirmed)
    - Pool Mint event, Burn event, Swap event
      NonfungiblePositionManager IncreaseLiquidity event, DecreaseLiquidity event, Collect event, Transfer event
      ```ts
      // Inside loadTransaction
      let transaction = Transaction.load(event.transaction.hash.toHexString())
      transaction.timestamp = event.block.timestamp
      ```

  * burns, mints, swaps (derived values)

    These fields are derived from reverse lookups.
    https://thegraph.com/docs/define-a-subgraph#reverse-lookups

- UniswapDayData (Data accumulated and condensed into day stats for all of Uniswap)
  * id (timestamp rounded to current day by dividing by 86400)
    - Pool Mint event, Burn event, Swap event
      ```ts
      updateUniswapDayData(event)

      // Inside updateUniswapDayData
      let timestamp = event.block.timestamp.toI32()
      let dayID = timestamp / 86400
      let uniswapDayData = UniswapDayData.load(dayID.toString())
      if (uniswapDayData === null) {
        uniswapDayData = new UniswapDayData(dayID.toString())
      }
      ```
      * updateUniswapDayData (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/intervalUpdates.ts#L23)
       - Uses Factory entity `totalValueLockedUSD`, `txCount` fields

  * date (timestamp rounded to current day by dividing by 86400)
    - Pool Mint event, Burn event, Swap event
      ```ts
      // Inside updateUniswapDayData
      let timestamp = event.block.timestamp.toI32()
      let dayID = timestamp / 86400
      let dayStartTimestamp = dayID * 86400
      let uniswapDayData = UniswapDayData.load(dayID.toString())

      if (uniswapDayData === null) {
        uniswapDayData = new UniswapDayData(dayID.toString())
        uniswapDayData.date = dayStartTimestamp
      }
      ```

  * tvlUSD (tvl in terms of USD)
    - Pool Mint event, Burn event, Swap event
      ```ts
      let uniswap = Factory.load(FACTORY_ADDRESS)
      let uniswapDayData = UniswapDayData.load(dayID.toString())
      uniswapDayData.tvlUSD = uniswap.totalValueLockedUSD
      ```

  * volumeUSD (total daily volume in Uniswap derived in terms of USD)
    - Pool Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      let amount0Abs = amount0
      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }
      let amount1Abs = amount1
      if (amount1.lt(ZERO_BD)) {
        amount1Abs = amount1.times(BigDecimal.fromString('-1'))
      }

      let amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0 as Token, amount1Abs, token1 as Token).div(
        BigDecimal.fromString('2')
      )

      let uniswapDayData = updateUniswapDayData(event)
      uniswapDayData.volumeUSD = uniswapDayData.volumeUSD.plus(amountTotalUSDTracked)
      ```

- PoolDayData (Data accumulated and condensed into day stats for each pool)
  * id (timestamp rounded to current day by dividing by 86400)
    - Pool Initialize event, Mint event, Burn event, Swap event
      ```ts
      let poolDayData = updatePoolDayData(event)

      // Inside updatePoolDayData
      let timestamp = event.block.timestamp.toI32()
      let dayID = timestamp / 86400
      let dayPoolID = event.address
        .toHexString()
        .concat('-')
        .concat(dayID.toString())

      let poolDayData = PoolDayData.load(dayPoolID)
      if (poolDayData === null) {
        poolDayData = new PoolDayData(dayPoolID)
      }
      ```
      * updatePoolDayData (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/intervalUpdates.ts#L43)
       - Uses Pool entity `token0Price`, `token1Price`, `liquidity`, `sqrtPrice`, `feeGrowthGlobal0X128`, `feeGrowthGlobal1X128`, `tick`, `totalValueLockedUSD` fields

  * date (timestamp rounded to current day by dividing by 86400)
    - Pool Initialize event, Mint event, Burn event, Swap event
      ```ts
      // Inside updatePoolDayData
      let timestamp = event.block.timestamp.toI32()
      let dayID = timestamp / 86400
      let dayStartTimestamp = dayID * 86400
      poolDayData.date = dayStartTimestamp
      ```

  * tvlUSD (tvl derived in USD at end of period)
    - Pool Initialize event, Mint event, Burn event, Swap event
      ```ts
      // Inside updatePoolDayData
      let pool = Pool.load(event.address.toHexString())
      poolDayData.tvlUSD = pool.totalValueLockedUSD
      ```

  * volumeUSD (volume in USD)
    - Pool Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      let amount0Abs = amount0
      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }
      let amount1Abs = amount1
      if (amount1.lt(ZERO_BD)) {
        amount1Abs = amount1.times(BigDecimal.fromString('-1'))
      }

      let amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0 as Token, amount1Abs, token1 as Token).div(
        BigDecimal.fromString('2')
      )

      poolDayData.volumeUSD = poolDayData.volumeUSD.plus(amountTotalUSDTracked)
      ```

- TokenDayData
  * id (token address concatendated with date)
    - Pool Mint event, Burn event, Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token0DayData = updateTokenDayData(token0 as Token, event)

      // Inside updateTokenDayData
      // token = token0
      let timestamp = event.block.timestamp.toI32()
      let dayID = timestamp / 86400
      let tokenDayID = token.id
        .toString()
        .concat('-')
        .concat(dayID.toString())

      let tokenDayData = TokenDayData.load(tokenDayID)
      if (tokenDayData === null) {
        tokenDayData = new TokenDayData(tokenDayID)
      }
      ```
      * updateTokenDayData (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/intervalUpdates.ts#L143)
        - Uses Bundle entity `ethPriceUSD` field

  * date (timestamp rounded to current day by dividing by 86400)
    - Pool Mint event, Burn event, Swap event
      ```ts
      // Inside updateTokenDayData
      let dayStartTimestamp = dayID * 86400

      if (tokenDayData === null) {
        tokenDayData = new TokenDayData(tokenDayID)
        tokenDayData.date = dayStartTimestamp
      }
      ```

  * totalValueLockedUSD (liquidity across all pools in derived USD)
    - Pool Mint event, Burn event, Swap event
      ```ts
      // Inside updateTokenDayData
      let tokenDayData = TokenDayData.load(tokenDayID)
      tokenDayData.totalValueLockedUSD = token.totalValueLockedUSD
      ```

  * volumeUSD (volume in derived USD)
    - Pool Swap event
      ```ts
      let pool = Pool.load(event.address.toHexString())
      let token0 = Token.load(pool.token0)
      let token1 = Token.load(pool.token1)
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      let amount0Abs = amount0
      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }
      let amount1Abs = amount1
      if (amount1.lt(ZERO_BD)) {
        amount1Abs = amount1.times(BigDecimal.fromString('-1'))
      }

      let amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0 as Token, amount1Abs, token1 as Token).div(
        BigDecimal.fromString('2')
      )

      token0DayData.volumeUSD = token0DayData.volumeUSD.plus(amountTotalUSDTracked)
      ```

- TokenHourData
  * id (token address concatendated with date)
    - Pool Mint event, Burn event, Swap event
      ```ts
      let token0HourData = updateTokenHourData(token0 as Token, event)

      // Inside updateTokenHourData
      // token = token0
      let tokenHourID = token.id
        .toString()
        .concat('-')
        .concat(hourIndex.toString())
      let tokenHourData = TokenHourData.load(tokenHourID)

      if (tokenHourData === null) {
        tokenHourData = new TokenHourData(tokenHourID)
      }
      ```
      * updateTokenDayData (https://github.com/Uniswap/uniswap-v3-subgraph/blob/main/src/utils/intervalUpdates.ts#L186)
        - Uses Bundle entity `ethPriceUSD` field

  * close (close price USD)
    - Pool Mint event, Burn event, Swap event
      ```ts
      // Inside updateTokenHourData
      let bundle = Bundle.load('1')
      let tokenPrice = token.derivedETH.times(bundle.ethPriceUSD)
      tokenHourData.close = tokenPrice
      ```

  * high (high price USD)
    - Pool Mint event, Burn event, Swap event
      ```ts
      // Inside updateTokenHourData
      let tokenHourData = TokenHourData.load(tokenHourID)
      if (tokenHourData === null) {
        tokenHourData = new TokenHourData(tokenHourID)
        tokenHourData.high = tokenPrice
      }

      if (tokenPrice.gt(tokenHourData.high)) {
        tokenHourData.high = tokenPrice
      }
      ```

  * low (low price USD)
    - Pool Mint event, Burn event, Swap event
      ```ts
      // Inside updateTokenHourData
      let tokenHourData = TokenHourData.load(tokenHourID)
      if (tokenHourData === null) {
        tokenHourData = new TokenHourData(tokenHourID)
        tokenHourData.low = tokenPrice
      }

      if (tokenPrice.lt(tokenHourData.low)) {
        tokenHourData.low = tokenPrice
      }
      ```

  * open (opening price USD)
    - Pool Mint event, Burn event, Swap event
      ```ts
      // Inside updateTokenHourData
      if (tokenHourData === null) {
        tokenHourData = new TokenHourData(tokenHourID)
        tokenHourData.open = tokenPrice
      }
      ```

  * periodStartUnix (unix timestamp for start of hour)
    - Pool Mint event, Burn event, Swap event
      ```ts
      // Inside updateTokenHourData
      if (tokenHourData === null) {
        tokenHourData = new TokenHourData(tokenHourID)
        tokenHourData.periodStartUnix = hourStartUnix
      }
      ```

