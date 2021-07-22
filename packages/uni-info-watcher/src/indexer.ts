import assert from 'assert';
import debug from 'debug';
import { DeepPartial } from 'typeorm';
import JSONbig from 'json-bigint';
import { BigNumber, utils } from 'ethers';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';

import { findEthPerToken, getEthPriceInUSD, getTrackedAmountUSD, sqrtPriceX96ToTokenPrices, WHITELIST_TOKENS } from './utils/pricing';
import { updatePoolDayData, updatePoolHourData, updateTokenDayData, updateTokenHourData, updateUniswapDayData } from './utils/interval-updates';
import { Token } from './entity/Token';
import { convertTokenToDecimal, loadTransaction, safeDiv } from './utils';
import { loadTick } from './utils/tick';
import Decimal from 'decimal.js';
import { Position } from './entity/Position';
import { Database } from './database';
import { Event } from './entity/Event';
import { ResultEvent, Block, Transaction, PoolCreatedEvent, InitializeEvent, MintEvent, BurnEvent, SwapEvent, IncreaseLiquidityEvent, DecreaseLiquidityEvent } from './events';

const log = debug('vulcanize:indexer');

export interface ValueResult {
  value: string | bigint;
  proof: {
    data: string;
  }
}

export class Indexer {
  _db: Database
  _uniClient: UniClient
  _erc20Client: ERC20Client

  constructor (db: Database, uniClient: UniClient, erc20Client: ERC20Client) {
    assert(db);
    assert(uniClient);

    this._db = db;
    this._uniClient = uniClient;
    this._erc20Client = erc20Client;
  }

  getResultEvent (event: Event): ResultEvent {
    const block = event.block;
    const eventFields = JSON.parse(event.eventInfo);

    return {
      block: {
        hash: block.blockHash,
        number: block.blockNumber,
        timestamp: block.blockTimestamp,
        parentHash: block.parentHash
      },

      tx: {
        hash: event.txHash
      },

      contract: event.contract,

      eventIndex: event.index,
      event: {
        __typename: event.eventName,
        ...eventFields
      },

      proof: JSON.parse(event.proof)
    };
  }

  // Note: Some event names might be unknown at this point, as earlier events might not yet be processed.
  async getOrFetchBlockEvents (block: Block): Promise<Array<Event>> {
    const blockProgress = await this._db.getBlockProgress(block.hash);

    if (!blockProgress) {
      // Fetch and save events first and make a note in the event sync progress table.
      await this._fetchAndSaveEvents(block);
      log('getBlockEvents: db miss, fetching from upstream server');
    }

    const events = await this._db.getBlockEvents(block.hash);
    log(`getBlockEvents: db hit, num events: ${events.length}`);

    return events;
  }

  async processEvent (dbEvent: Event): Promise<void> {
    const resultEvent = this.getResultEvent(dbEvent);

    // TODO: Process proof (proof.data) in event.
    const { contract, block, tx, event } = resultEvent;
    const { __typename: eventType } = event;

    switch (eventType) {
      case 'PoolCreatedEvent':
        log('Factory PoolCreated event', contract);
        this._handlePoolCreated(block, contract, tx, event as PoolCreatedEvent);
        break;

      case 'InitializeEvent':
        log('Pool Initialize event', contract);
        this._handleInitialize(block, contract, tx, event as InitializeEvent);
        break;

      case 'MintEvent':
        log('Pool Mint event', contract);
        this._handleMint(block, contract, tx, event as MintEvent);
        break;

      case 'BurnEvent':
        log('Pool Burn event', contract);
        this._handleBurn(block, contract, tx, event as BurnEvent);
        break;

      case 'SwapEvent':
        log('Pool Swap event', contract);
        this._handleSwap(block, contract, tx, event as SwapEvent);
        break;

      case 'IncreaseLiquidityEvent':
        log('NFPM IncreaseLiquidity event', contract);
        this._handleIncreaseLiquidity(block, contract, tx, event as IncreaseLiquidityEvent);
        break;

      case 'DecreaseLiquidityEvent':
        log('NFPM DecreaseLiquidity event', contract);
        this._handleDecreaseLiquidity(block, contract, tx, event as DecreaseLiquidityEvent);
        break;

      default:
        break;
    }
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._db.getEvent(id);
  }

  async updateBlockProgress (blockHash: string): Promise<void> {
    return this._db.updateBlockProgress(blockHash);
  }

  async _fetchAndSaveEvents (block: Block): Promise<void> {
    const events = await this._uniClient.getEvents(block.hash);
    const dbEvents: Array<DeepPartial<Event>> = [];

    for (let i = 0; i < events.length; i++) {
      const {
        tx,
        contract,
        eventIndex,
        event,
        proof
      } = events[i];

      const { __typename: eventName, ...eventInfo } = event;

      dbEvents.push({
        index: eventIndex,
        txHash: tx.hash,
        contract,
        eventName,
        eventInfo: JSONbig.stringify(eventInfo),
        proof: JSONbig.stringify(proof)
      });
    }

    await this._db.saveEvents(block, dbEvents);
  }

  async _handlePoolCreated (block: Block, contractAddress: string, tx: Transaction, poolCreatedEvent: PoolCreatedEvent): Promise<void> {
    const { number: blockNumber, hash: blockHash } = block;
    const { token0: token0Address, token1: token1Address, fee, pool: poolAddress } = poolCreatedEvent;

    // Load factory.
    const factory = await this._db.loadFactory({ blockNumber, id: contractAddress });

    // Update Factory.
    let factoryPoolCount = BigNumber.from(factory.poolCount);
    factoryPoolCount = factoryPoolCount.add(1);
    factory.poolCount = BigInt(factoryPoolCount.toHexString());

    // Get Tokens.
    let [token0, token1] = await Promise.all([
      this._db.getToken({ blockNumber, id: token0Address }),
      this._db.getToken({ blockNumber, id: token1Address })
    ]);

    // Create Tokens if not present.
    if (!token0) {
      token0 = await this._createToken(blockHash, blockNumber, token0Address);
    }

    if (!token1) {
      token1 = await this._createToken(blockHash, blockNumber, token1Address);
    }

    // Create new Pool entity.
    // Skipping adding createdAtTimestamp field as it is not queried in frontend subgraph.
    const pool = await this._db.loadPool({
      blockNumber,
      id: poolAddress,
      token0: token0,
      token1: token1,
      feeTier: BigInt(fee)
    });

    // Update white listed pools.
    if (WHITELIST_TOKENS.includes(token0.id)) {
      token1.whitelistPools.push(pool);
      await this._db.saveToken(token1, blockNumber);
    }

    if (WHITELIST_TOKENS.includes(token1.id)) {
      token0.whitelistPools.push(pool);
      await this._db.saveToken(token0, blockNumber);
    }

    // Save entities to DB.
    await this._db.saveFactory(factory, blockNumber);
  }

  /**
   * Create new Token.
   * @param tokenAddress
   */
  async _createToken (blockHash: string, blockNumber: number, tokenAddress: string): Promise<Token> {
    const { value: symbol } = await this._erc20Client.getSymbol(blockHash, tokenAddress);
    const { value: name } = await this._erc20Client.getName(blockHash, tokenAddress);
    const { value: totalSupply } = await this._erc20Client.getTotalSupply(blockHash, tokenAddress);

    // TODO: Decimals not implemented by erc20-watcher.
    // const { value: decimals } = await this._erc20Client.getDecimals(blockHash, tokenAddress);

    return this._db.loadToken({
      blockNumber,
      id: tokenAddress,
      symbol,
      name,
      totalSupply
    });
  }

  async _handleInitialize (block: Block, contractAddress: string, tx: Transaction, initializeEvent: InitializeEvent): Promise<void> {
    const { number: blockNumber, timestamp: blockTimestamp } = block;
    const { sqrtPriceX96, tick } = initializeEvent;
    const pool = await this._db.getPool({ id: contractAddress, blockNumber });
    assert(pool, `Pool ${contractAddress} not found.`);

    // Update Pool.
    pool.sqrtPrice = BigInt(sqrtPriceX96);
    pool.tick = BigInt(tick);
    this._db.savePool(pool, blockNumber);

    // Update ETH price now that prices could have changed.
    const bundle = await this._db.loadBundle({ id: '1', blockNumber });
    bundle.ethPriceUSD = await getEthPriceInUSD(this._db);
    this._db.saveBundle(bundle, blockNumber);

    await updatePoolDayData(this._db, { contractAddress, blockNumber, blockTimestamp });
    await updatePoolHourData(this._db, { contractAddress, blockNumber, blockTimestamp });

    const [token0, token1] = await Promise.all([
      this._db.getToken({ id: pool.token0.id, blockNumber }),
      this._db.getToken({ id: pool.token1.id, blockNumber })
    ]);

    assert(token0 && token1, 'Pool tokens not found.');

    // Update token prices.
    token0.derivedETH = await findEthPerToken(token0);
    token1.derivedETH = await findEthPerToken(token1);

    await Promise.all([
      this._db.saveToken(token0, blockNumber),
      this._db.saveToken(token1, blockNumber)
    ]);
  }

  async _handleMint (block: Block, contractAddress: string, tx: Transaction, mintEvent: MintEvent): Promise<void> {
    const { number: blockNumber, timestamp: blockTimestamp } = block;
    const { hash: txHash } = tx;
    const bundle = await this._db.loadBundle({ id: '1', blockNumber });
    const poolAddress = contractAddress;
    const pool = await this._db.loadPool({ id: poolAddress, blockNumber });

    // TODO: In subgraph factory is fetched by hardcoded factory address.
    // Currently fetching first factory in database as only one exists.
    const [factory] = await this._db.getFactories({ blockNumber }, { limit: 1 });

    const token0 = pool.token0;
    const token1 = pool.token1;
    const amount0 = convertTokenToDecimal(mintEvent.amount0, BigInt(token0.decimals));
    const amount1 = convertTokenToDecimal(mintEvent.amount1, BigInt(token1.decimals));

    const amountUSD = amount0
      .times(token0.derivedETH.times(bundle.ethPriceUSD))
      .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)));

    // Reset tvl aggregates until new amounts calculated.
    factory.totalValueLockedETH = factory.totalValueLockedETH.minus(pool.totalValueLockedETH);

    // Update globals.
    factory.txCount = BigInt(factory.txCount) + BigInt(1);

    // Update token0 data.
    token0.txCount = BigInt(token0.txCount) + BigInt(1);
    token0.totalValueLocked = token0.totalValueLocked.plus(amount0);
    token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD));

    // Update token1 data.
    token1.txCount = BigInt(token1.txCount) + BigInt(1);
    token1.totalValueLocked = token1.totalValueLocked.plus(amount1);
    token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD));

    // Pool data.
    pool.txCount = BigInt(pool.txCount) + BigInt(1);

    // Pools liquidity tracks the currently active liquidity given pools current tick.
    // We only want to update it on mint if the new position includes the current tick.
    if (pool.tick !== null) {
      if (
        BigInt(mintEvent.tickLower) <= BigInt(pool.tick) &&
        BigInt(mintEvent.tickUpper) > BigInt(pool.tick)
      ) {
        pool.liquidity = BigInt(pool.liquidity) + BigInt(mintEvent.amount);
      }
    }

    pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0);
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1);

    pool.totalValueLockedETH = pool.totalValueLockedToken0.times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH));

    pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

    // Reset aggregates with new amounts.
    factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
    factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

    const transaction = await loadTransaction(this._db, { txHash, blockNumber, blockTimestamp });

    await this._db.loadMint({
      id: transaction.id + '#' + pool.txCount.toString(),
      blockNumber,
      transaction,
      timestamp: transaction.timestamp,
      pool,
      token0: pool.token0,
      token1: pool.token1,
      owner: mintEvent.owner,
      sender: mintEvent.sender,

      // TODO: Assign origin with Transaction from address.
      // origin: event.transaction.from

      amount: mintEvent.amount,
      amount0: amount0,
      amount1: amount1,
      amountUSD: amountUSD,
      tickLower: mintEvent.tickLower,
      tickUpper: mintEvent.tickUpper
    });

    // Tick entities.
    const lowerTickIdx = mintEvent.tickLower;
    const upperTickIdx = mintEvent.tickUpper;

    const lowerTickId = poolAddress + '#' + mintEvent.tickLower.toString();
    const upperTickId = poolAddress + '#' + mintEvent.tickUpper.toString();

    const lowerTick = await loadTick(this._db, lowerTickId, BigInt(lowerTickIdx), pool, blockNumber);
    const upperTick = await loadTick(this._db, upperTickId, BigInt(upperTickIdx), pool, blockNumber);

    const amount = BigInt(mintEvent.amount);
    lowerTick.liquidityGross = BigInt(lowerTick.liquidityGross) + amount;
    lowerTick.liquidityNet = BigInt(lowerTick.liquidityNet) + amount;
    upperTick.liquidityGross = BigInt(upperTick.liquidityGross) + amount;
    upperTick.liquidityNet = BigInt(upperTick.liquidityNet) + amount;

    // TODO: Update Tick's volume, fees, and liquidity provider count.
    // Computing these on the tick level requires reimplementing some of the swapping code from v3-core.

    await updateUniswapDayData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updatePoolDayData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updatePoolHourData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updateTokenDayData(this._db, token0, { blockNumber, blockTimestamp });
    await updateTokenDayData(this._db, token1, { blockNumber, blockTimestamp });
    await updateTokenHourData(this._db, token0, { blockNumber, blockTimestamp });
    await updateTokenHourData(this._db, token1, { blockNumber, blockTimestamp });

    await Promise.all([
      this._db.saveToken(token0, blockNumber),
      this._db.saveToken(token1, blockNumber)
    ]);

    await this._db.savePool(pool, blockNumber);
    await this._db.saveFactory(factory, blockNumber);

    await Promise.all([
      await this._db.saveTick(lowerTick, blockNumber),
      await this._db.saveTick(upperTick, blockNumber)
    ]);

    // Skipping update inner tick vars and tick day data as they are not queried.
  }

  async _handleBurn (block: Block, contractAddress: string, tx: Transaction, burnEvent: BurnEvent): Promise<void> {
    const { number: blockNumber, timestamp: blockTimestamp } = block;
    const { hash: txHash } = tx;
    const bundle = await this._db.loadBundle({ id: '1', blockNumber });
    const poolAddress = contractAddress;
    const pool = await this._db.loadPool({ id: poolAddress, blockNumber });

    // TODO: In subgraph factory is fetched by hardcoded factory address.
    // Currently fetching first factory in database as only one exists.
    const [factory] = await this._db.getFactories({ blockNumber }, { limit: 1 });

    const token0 = pool.token0;
    const token1 = pool.token1;
    const amount0 = convertTokenToDecimal(burnEvent.amount0, BigInt(token0.decimals));
    const amount1 = convertTokenToDecimal(burnEvent.amount1, BigInt(token1.decimals));

    const amountUSD = amount0
      .times(token0.derivedETH.times(bundle.ethPriceUSD))
      .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)));

    // Reset tvl aggregates until new amounts calculated.
    factory.totalValueLockedETH = factory.totalValueLockedETH.minus(pool.totalValueLockedETH);

    // Update globals.
    factory.txCount = BigInt(factory.txCount) + BigInt(1);

    // Update token0 data.
    token0.txCount = BigInt(token0.txCount) + BigInt(1);
    token0.totalValueLocked = token0.totalValueLocked.minus(amount0);
    token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD));

    // Update token1 data.
    token1.txCount = BigInt(token1.txCount) + BigInt(1);
    token1.totalValueLocked = token1.totalValueLocked.minus(amount1);
    token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD));

    // Pool data.
    pool.txCount = BigInt(pool.txCount) + BigInt(1);

    // Pools liquidity tracks the currently active liquidity given pools current tick.
    // We only want to update it on burn if the position being burnt includes the current tick.
    if (
      pool.tick !== null &&
      burnEvent.tickLower <= pool.tick &&
      burnEvent.tickUpper > pool.tick
    ) {
      pool.liquidity = pool.liquidity - burnEvent.amount;
    }

    pool.totalValueLockedToken0 = pool.totalValueLockedToken0.minus(amount0);
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1.minus(amount1);

    pool.totalValueLockedETH = pool.totalValueLockedToken0
      .times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH));

    pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

    // Reset aggregates with new amounts.
    factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
    factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

    // Burn entity.
    const transaction = await loadTransaction(this._db, { txHash, blockNumber, blockTimestamp });

    await this._db.loadBurn({
      id: transaction.id + '#' + pool.txCount.toString(),
      blockNumber,
      transaction,
      timestamp: transaction.timestamp,
      pool,
      token0: pool.token0,
      token1: pool.token1,
      owner: burnEvent.owner,

      // TODO: Assign origin with Transaction from address.
      // origin: event.transaction.from

      amount: burnEvent.amount,
      amount0,
      amount1,
      amountUSD,
      tickLower: burnEvent.tickLower,
      tickUpper: burnEvent.tickUpper
    });

    // Tick entities.
    const lowerTickId = poolAddress + '#' + (burnEvent.tickLower).toString();
    const upperTickId = poolAddress + '#' + (burnEvent.tickUpper).toString();
    const lowerTick = await this._db.loadTick({ id: lowerTickId, blockNumber });
    const upperTick = await this._db.loadTick({ id: upperTickId, blockNumber });
    const amount = BigInt(burnEvent.amount);
    lowerTick.liquidityGross = BigInt(lowerTick.liquidityGross) - amount;
    lowerTick.liquidityNet = BigInt(lowerTick.liquidityNet) - amount;
    upperTick.liquidityGross = BigInt(upperTick.liquidityGross) - amount;
    upperTick.liquidityNet = BigInt(upperTick.liquidityNet) + amount;

    await updateUniswapDayData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updatePoolDayData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updatePoolHourData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updateTokenDayData(this._db, token0, { blockNumber, blockTimestamp });
    await updateTokenDayData(this._db, token0, { blockNumber, blockTimestamp });
    await updateTokenHourData(this._db, token0, { blockNumber, blockTimestamp });
    await updateTokenHourData(this._db, token0, { blockNumber, blockTimestamp });

    // Skipping update Tick fee and Tick day data as they are not queried.

    await Promise.all([
      await this._db.saveTick(lowerTick, blockNumber),
      await this._db.saveTick(upperTick, blockNumber)
    ]);

    await Promise.all([
      this._db.saveToken(token0, blockNumber),
      this._db.saveToken(token1, blockNumber)
    ]);

    await this._db.savePool(pool, blockNumber);
    await this._db.saveFactory(factory, blockNumber);
  }

  async _handleSwap (block: Block, contractAddress: string, tx: Transaction, swapEvent: SwapEvent): Promise<void> {
    const { number: blockNumber, timestamp: blockTimestamp } = block;
    const { hash: txHash } = tx;
    const bundle = await this._db.loadBundle({ id: '1', blockNumber });

    // TODO: In subgraph factory is fetched by hardcoded factory address.
    // Currently fetching first factory in database as only one exists.
    const [factory] = await this._db.getFactories({ blockNumber }, { limit: 1 });

    const pool = await this._db.loadPool({ id: contractAddress, blockNumber });

    // Hot fix for bad pricing.
    if (pool.id === '0x9663f2ca0454accad3e094448ea6f77443880454') {
      return;
    }

    const [token0, token1] = await Promise.all([
      this._db.getToken({ id: pool.token0.id, blockNumber }),
      this._db.getToken({ id: pool.token1.id, blockNumber })
    ]);

    assert(token0 && token1, 'Pool tokens not found.');

    // Amounts - 0/1 are token deltas. Can be positive or negative.
    const amount0 = convertTokenToDecimal(swapEvent.amount0, BigInt(token0.decimals));
    const amount1 = convertTokenToDecimal(swapEvent.amount1, BigInt(token1.decimals));

    // Need absolute amounts for volume.
    let amount0Abs = amount0;
    let amount1Abs = amount1;

    if (amount0.lt(new Decimal(0))) {
      amount0Abs = amount0.times(new Decimal('-1'));
    }

    if (amount1.lt(new Decimal(0))) {
      amount1Abs = amount1.times(new Decimal('-1'));
    }

    const amount0ETH = amount0Abs.times(token0.derivedETH);
    const amount1ETH = amount1Abs.times(token1.derivedETH);
    const amount0USD = amount0ETH.times(bundle.ethPriceUSD);
    const amount1USD = amount1ETH.times(bundle.ethPriceUSD);

    // Get amount that should be tracked only - div 2 because cant count both input and output as volume.
    const trackedAmountUSD = await getTrackedAmountUSD(this._db, amount0Abs, token0, amount1Abs, token1);
    const amountTotalUSDTracked = trackedAmountUSD.div(new Decimal('2'));
    const amountTotalETHTracked = safeDiv(amountTotalUSDTracked, bundle.ethPriceUSD);
    const amountTotalUSDUntracked = amount0USD.plus(amount1USD).div(new Decimal('2'));

    const feesETH = amountTotalETHTracked.times(pool.feeTier.toString()).div(new Decimal('1000000'));
    const feesUSD = amountTotalUSDTracked.times(pool.feeTier.toString()).div(new Decimal('1000000'));

    // Global updates.
    factory.txCount = BigInt(factory.txCount) + BigInt(1);
    factory.totalVolumeETH = factory.totalVolumeETH.plus(amountTotalETHTracked);
    factory.totalVolumeUSD = factory.totalVolumeUSD.plus(amountTotalUSDTracked);
    factory.untrackedVolumeUSD = factory.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
    factory.totalFeesETH = factory.totalFeesETH.plus(feesETH);
    factory.totalFeesUSD = factory.totalFeesUSD.plus(feesUSD);

    // Reset aggregate tvl before individual pool tvl updates.
    const currentPoolTvlETH = pool.totalValueLockedETH;
    factory.totalValueLockedETH = factory.totalValueLockedETH.minus(currentPoolTvlETH);

    // pool volume
    pool.volumeToken0 = pool.volumeToken0.plus(amount0Abs);
    pool.volumeToken1 = pool.volumeToken1.plus(amount1Abs);
    pool.volumeUSD = pool.volumeUSD.plus(amountTotalUSDTracked);
    pool.untrackedVolumeUSD = pool.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
    pool.feesUSD = pool.feesUSD.plus(feesUSD);
    pool.txCount = BigInt(pool.txCount) + BigInt(1);

    // Update the pool with the new active liquidity, price, and tick.
    pool.liquidity = swapEvent.liquidity;
    pool.tick = BigInt(swapEvent.tick);
    pool.sqrtPrice = swapEvent.sqrtPriceX96;
    pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0);
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1);

    // Update token0 data.
    token0.volume = token0.volume.plus(amount0Abs);
    token0.totalValueLocked = token0.totalValueLocked.plus(amount0);
    token0.volumeUSD = token0.volumeUSD.plus(amountTotalUSDTracked);
    token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
    token0.feesUSD = token0.feesUSD.plus(feesUSD);
    token0.txCount = BigInt(token0.txCount) + BigInt(1);

    // Update token1 data.
    token1.volume = token1.volume.plus(amount1Abs);
    token1.totalValueLocked = token1.totalValueLocked.plus(amount1);
    token1.volumeUSD = token1.volumeUSD.plus(amountTotalUSDTracked);
    token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
    token1.feesUSD = token1.feesUSD.plus(feesUSD);
    token1.txCount = BigInt(token1.txCount) + BigInt(1);

    // Updated pool rates.
    const prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0 as Token, token1 as Token);
    pool.token0Price = prices[0];
    pool.token1Price = prices[1];
    this._db.savePool(pool, blockNumber);

    // Update USD pricing.
    bundle.ethPriceUSD = await getEthPriceInUSD(this._db);
    this._db.saveBundle(bundle, blockNumber);
    token0.derivedETH = await findEthPerToken(token0);
    token1.derivedETH = await findEthPerToken(token1);

    /**
     * Things afffected by new USD rates.
     */
    pool.totalValueLockedETH = pool.totalValueLockedToken0
      .times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH));

    pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

    factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
    factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

    token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH).times(bundle.ethPriceUSD);
    token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH).times(bundle.ethPriceUSD);

    // Create Swap event
    const transaction = await loadTransaction(this._db, { txHash, blockNumber, blockTimestamp });

    await this._db.loadSwap({
      id: transaction.id + '#' + pool.txCount.toString(),
      blockNumber,
      transaction,
      timestamp: transaction.timestamp,
      pool,
      token0: pool.token0,
      token1: pool.token1,
      sender: swapEvent.sender,

      // TODO: Assign origin with Transaction from address.
      // origin: event.transaction.from

      recipient: swapEvent.recipient,
      amount0: amount0,
      amount1: amount1,
      amountUSD: amountTotalUSDTracked,
      tick: BigInt(swapEvent.tick),
      sqrtPriceX96: swapEvent.sqrtPriceX96
    });

    // Skipping update pool fee growth as they are not queried.

    // Interval data.
    const uniswapDayData = await updateUniswapDayData(this._db, { blockNumber, contractAddress, blockTimestamp });
    const poolDayData = await updatePoolDayData(this._db, { blockNumber, contractAddress, blockTimestamp });
    const poolHourData = await updatePoolHourData(this._db, { blockNumber, contractAddress, blockTimestamp });
    const token0DayData = await updateTokenDayData(this._db, token0, { blockNumber, blockTimestamp });
    const token1DayData = await updateTokenDayData(this._db, token0, { blockNumber, blockTimestamp });
    const token0HourData = await updateTokenHourData(this._db, token0, { blockNumber, blockTimestamp });
    const token1HourData = await updateTokenHourData(this._db, token0, { blockNumber, blockTimestamp });

    // Update volume metrics.
    uniswapDayData.volumeETH = uniswapDayData.volumeETH.plus(amountTotalETHTracked);
    uniswapDayData.volumeUSD = uniswapDayData.volumeUSD.plus(amountTotalUSDTracked);
    uniswapDayData.feesUSD = uniswapDayData.feesUSD.plus(feesUSD);

    poolDayData.volumeUSD = poolDayData.volumeUSD.plus(amountTotalUSDTracked);
    poolDayData.volumeToken0 = poolDayData.volumeToken0.plus(amount0Abs);
    poolDayData.volumeToken1 = poolDayData.volumeToken1.plus(amount1Abs);
    poolDayData.feesUSD = poolDayData.feesUSD.plus(feesUSD);

    poolHourData.volumeUSD = poolHourData.volumeUSD.plus(amountTotalUSDTracked);
    poolHourData.volumeToken0 = poolHourData.volumeToken0.plus(amount0Abs);
    poolHourData.volumeToken1 = poolHourData.volumeToken1.plus(amount1Abs);
    poolHourData.feesUSD = poolHourData.feesUSD.plus(feesUSD);

    token0DayData.volume = token0DayData.volume.plus(amount0Abs);
    token0DayData.volumeUSD = token0DayData.volumeUSD.plus(amountTotalUSDTracked);
    token0DayData.untrackedVolumeUSD = token0DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
    token0DayData.feesUSD = token0DayData.feesUSD.plus(feesUSD);

    token0HourData.volume = token0HourData.volume.plus(amount0Abs);
    token0HourData.volumeUSD = token0HourData.volumeUSD.plus(amountTotalUSDTracked);
    token0HourData.untrackedVolumeUSD = token0HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
    token0HourData.feesUSD = token0HourData.feesUSD.plus(feesUSD);

    token1DayData.volume = token1DayData.volume.plus(amount1Abs);
    token1DayData.volumeUSD = token1DayData.volumeUSD.plus(amountTotalUSDTracked);
    token1DayData.untrackedVolumeUSD = token1DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
    token1DayData.feesUSD = token1DayData.feesUSD.plus(feesUSD);

    token1HourData.volume = token1HourData.volume.plus(amount1Abs);
    token1HourData.volumeUSD = token1HourData.volumeUSD.plus(amountTotalUSDTracked);
    token1HourData.untrackedVolumeUSD = token1HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
    token1HourData.feesUSD = token1HourData.feesUSD.plus(feesUSD);

    this._db.saveTokenDayData(token0DayData, blockNumber);
    this._db.saveTokenDayData(token1DayData, blockNumber);
    this._db.saveUniswapDayData(uniswapDayData, blockNumber);
    this._db.savePoolDayData(poolDayData, blockNumber);
    this._db.saveFactory(factory, blockNumber);
    this._db.savePool(pool, blockNumber);
    this._db.saveToken(token0, blockNumber);
    this._db.saveToken(token1, blockNumber);

    // Skipping update of inner vars of current or crossed ticks as they are not queried.
  }

  async _handleIncreaseLiquidity (block: Block, contractAddress: string, tx: Transaction, event: IncreaseLiquidityEvent): Promise<void> {
    const { number: blockNumber } = block;
    const position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));

    // position was not able to be fetched.
    if (position === null) {
      return;
    }

    // Temp fix from Subgraph mapping code.
    if (utils.getAddress(position.pool.id) === utils.getAddress('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
      return;
    }

    const token0 = position.token0;
    const token1 = position.token1;

    const amount0 = convertTokenToDecimal(BigInt(event.amount0), BigInt(token0.decimals));
    const amount1 = convertTokenToDecimal(BigInt(event.amount1), BigInt(token1.decimals));

    position.liquidity = BigInt(position.liquidity) + BigInt(event.liquidity);
    position.depositedToken0 = position.depositedToken0.plus(amount0);
    position.depositedToken1 = position.depositedToken1.plus(amount1);

    await this._updateFeeVars(position, block, contractAddress, BigInt(event.tokenId));

    await this._db.savePosition(position, blockNumber);

    await this._savePositionSnapshot(position, block, tx);
  }

  async _handleDecreaseLiquidity (block: Block, contractAddress: string, tx: Transaction, event: DecreaseLiquidityEvent): Promise<void> {
    const { number: blockNumber } = block;
    const position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));

    // Position was not able to be fetched.
    if (position == null) {
      return;
    }

    // Temp fix from Subgraph mapping code.
    if (utils.getAddress(position.pool.id) === utils.getAddress('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
      return;
    }

    const token0 = position.token0;
    const token1 = position.token1;
    const amount0 = convertTokenToDecimal(BigInt(event.amount0), BigInt(token0.decimals));
    const amount1 = convertTokenToDecimal(BigInt(event.amount1), BigInt(token1.decimals));

    position.liquidity = BigInt(position.liquidity) - BigInt(event.liquidity);
    position.depositedToken0 = position.depositedToken0.plus(amount0);
    position.depositedToken1 = position.depositedToken1.plus(amount1);

    await this._updateFeeVars(position, block, contractAddress, BigInt(event.tokenId));

    await this._db.savePosition(position, blockNumber);

    await this._savePositionSnapshot(position, block, tx);
  }

  async _getPosition (block: Block, contractAddress: string, tx: Transaction, tokenId: bigint): Promise<Position | null> {
    const { number: blockNumber, hash: blockHash, timestamp: blockTimestamp } = block;
    const { hash: txHash } = tx;
    let position = await this._db.getPosition({ id: tokenId.toString(), blockNumber });

    if (!position) {
      const nfpmPosition = await this._uniClient.getPosition(blockHash, tokenId);

      // The contract call reverts in situations where the position is minted and deleted in the same block.
      // From my investigation this happens in calls from BancorSwap.
      // (e.g. 0xf7867fa19aa65298fadb8d4f72d0daed5e836f3ba01f0b9b9631cdc6c36bed40)

      if (nfpmPosition) {
        const { token0: token0Address, token1: token1Address, fee } = await this._uniClient.poolIdToPoolKey(blockHash, nfpmPosition.poolId);

        const { pool: poolAddress } = await this._uniClient.getPool(blockHash, token0Address, token1Address, fee);

        const transaction = await loadTransaction(this._db, { txHash, blockNumber, blockTimestamp });
        const pool = await this._db.getPool({ id: poolAddress, blockNumber });

        const [token0, token1] = await Promise.all([
          this._db.getToken({ id: token0Address, blockNumber }),
          this._db.getToken({ id: token0Address, blockNumber })
        ]);

        const [tickLower, tickUpper] = await Promise.all([
          this._db.getTick({ id: poolAddress.concat('#').concat(nfpmPosition.tickLower.toString()), blockNumber }),
          this._db.getTick({ id: poolAddress.concat('#').concat(nfpmPosition.tickUpper.toString()), blockNumber })
        ]);

        position = await this._db.loadPosition({
          id: tokenId.toString(),
          blockNumber,
          pool,
          token0,
          token1,
          tickLower,
          tickUpper,
          transaction,
          feeGrowthInside0LastX128: BigInt(nfpmPosition.feeGrowthInside0LastX128.toString()),
          feeGrowthInside1LastX128: BigInt(nfpmPosition.feeGrowthInside1LastX128.toString())
        });
      }
    }

    return position || null;
  }

  async _updateFeeVars (position: Position, block: Block, contractAddress: string, tokenId: bigint): Promise<Position> {
    const nfpmPosition = await this._uniClient.getPosition(block.hash, tokenId);

    if (nfpmPosition) {
      position.feeGrowthInside0LastX128 = BigInt(nfpmPosition.feeGrowthInside0LastX128.toString());
      position.feeGrowthInside1LastX128 = BigInt(nfpmPosition.feeGrowthInside1LastX128.toString());
    }

    return position;
  }

  async _savePositionSnapshot (position: Position, block: Block, tx: Transaction): Promise<void> {
    const transaction = await loadTransaction(this._db, { txHash: tx.hash, blockNumber: block.number, blockTimestamp: block.timestamp });

    await this._db.loadPositionSnapshot({
      id: position.id.concat('#').concat(block.number.toString()),
      blockNumber: block.number,
      owner: position.owner,
      pool: position.pool,
      position: position,
      timestamp: block.timestamp,
      liquidity: position.liquidity,
      depositedToken0: position.depositedToken0,
      depositedToken1: position.depositedToken1,
      withdrawnToken0: position.withdrawnToken0,
      withdrawnToken1: position.withdrawnToken1,
      collectedFeesToken0: position.collectedFeesToken0,
      collectedFeesToken1: position.collectedFeesToken1,
      transaction,
      feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
      feeGrowthInside1LastX128: position.feeGrowthInside1LastX128
    });
  }
}
