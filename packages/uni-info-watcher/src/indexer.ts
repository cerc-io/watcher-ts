import assert from 'assert';
import debug from 'debug';
import { DeepPartial } from 'typeorm';
import JSONbig from 'json-bigint';
import { utils } from 'ethers';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { EthClient } from '@vulcanize/ipld-eth-client';

import { findEthPerToken, getEthPriceInUSD, getTrackedAmountUSD, sqrtPriceX96ToTokenPrices, WHITELIST_TOKENS } from './utils/pricing';
import { updatePoolDayData, updatePoolHourData, updateTokenDayData, updateTokenHourData, updateUniswapDayData } from './utils/interval-updates';
import { Token } from './entity/Token';
import { convertTokenToDecimal, loadTransaction, safeDiv } from './utils';
import { createTick } from './utils/tick';
import Decimal from 'decimal.js';
import { Position } from './entity/Position';
import { Database } from './database';
import { Event } from './entity/Event';
import { ResultEvent, Block, Transaction, PoolCreatedEvent, InitializeEvent, MintEvent, BurnEvent, SwapEvent, IncreaseLiquidityEvent, DecreaseLiquidityEvent, CollectEvent, TransferEvent } from './events';
import { Factory } from './entity/Factory';
import { Bundle } from './entity/Bundle';
import { Pool } from './entity/Pool';
import { Mint } from './entity/Mint';
import { Burn } from './entity/Burn';
import { Swap } from './entity/Swap';
import { PositionSnapshot } from './entity/PositionSnapshot';
import { SyncStatus } from './entity/SyncStatus';
import { BlockProgress } from './entity/BlockProgress';

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
  _ethClient: EthClient

  constructor (db: Database, uniClient: UniClient, erc20Client: ERC20Client, ethClient: EthClient) {
    assert(db);
    assert(uniClient);
    assert(erc20Client);
    assert(ethClient);

    this._db = db;
    this._uniClient = uniClient;
    this._erc20Client = erc20Client;
    this._ethClient = ethClient;
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
    const { contract, tx, block, event } = resultEvent;
    const { __typename: eventName } = event;

    switch (eventName) {
      case 'PoolCreatedEvent':
        log('Factory PoolCreated event', contract);
        await this._handlePoolCreated(block, contract, tx, event as PoolCreatedEvent);
        break;

      case 'InitializeEvent':
        log('Pool Initialize event', contract);
        await this._handleInitialize(block, contract, tx, event as InitializeEvent);
        break;

      case 'MintEvent':
        log('Pool Mint event', contract);
        await this._handleMint(block, contract, tx, event as MintEvent);
        break;

      case 'BurnEvent':
        log('Pool Burn event', contract);
        await this._handleBurn(block, contract, tx, event as BurnEvent);
        break;

      case 'SwapEvent':
        log('Pool Swap event', contract);
        await this._handleSwap(block, contract, tx, event as SwapEvent);
        break;

      case 'IncreaseLiquidityEvent':
        log('NFPM IncreaseLiquidity event', contract);
        await this._handleIncreaseLiquidity(block, contract, tx, event as IncreaseLiquidityEvent);
        break;

      case 'DecreaseLiquidityEvent':
        log('NFPM DecreaseLiquidity event', contract);
        await this._handleDecreaseLiquidity(block, contract, tx, event as DecreaseLiquidityEvent);
        break;

      case 'CollectEvent':
        log('NFPM Collect event', contract);
        await this._handleCollect(block, contract, tx, event as CollectEvent);
        break;

      case 'TransferEvent':
        log('NFPM Transfer event', contract);
        await this._handleTransfer(block, contract, tx, event as TransferEvent);
        break;

      default:
        log('Event not handled', eventName);
        break;
    }

    log('Event processing completed for', eventName);
  }

  async updateSyncStatus (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    return this._db.updateSyncStatus(blockHash, blockNumber);
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._db.getSyncStatus();
  }

  async getBlock (blockHash: string): Promise<any> {
    const { block } = await this._ethClient.getLogs({ blockHash });
    return block;
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._db.getEvent(id);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._db.getBlockProgress(blockHash);
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
    const { token0: token0Address, token1: token1Address, fee, pool: poolAddress } = poolCreatedEvent;

    // Temp fix from Subgraph mapping code.
    if (utils.getAddress(poolAddress) === utils.getAddress('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
      return;
    }

    // Load factory.
    let factory = await this._db.getFactory({ blockHash: block.hash, id: contractAddress });

    if (!factory) {
      factory = new Factory();
      factory.id = contractAddress;
      factory = await this._db.saveFactory(factory, block);

      // Create new bundle for tracking eth price.
      const bundle = new Bundle();
      bundle.id = '1';
      await this._db.saveBundle(bundle, block);
    }

    // Update Factory.
    factory.poolCount = BigInt(factory.poolCount) + BigInt(1);

    let pool = new Pool();
    pool.id = poolAddress;

    // Get Tokens.
    let [token0, token1] = await Promise.all([
      this._db.getToken({ blockHash: block.hash, id: token0Address }),
      this._db.getToken({ blockHash: block.hash, id: token1Address })
    ]);

    // Create Tokens if not present.
    if (!token0) {
      token0 = await this._createToken(block, token0Address);
    }

    if (!token1) {
      token1 = await this._createToken(block, token1Address);
    }

    pool.token0 = token0;
    pool.token1 = token1;
    pool.feeTier = BigInt(fee);
    pool = await this._db.savePool(pool, block);

    // Update white listed pools.
    if (WHITELIST_TOKENS.includes(token0.id)) {
      token1.whitelistPools.push(pool);
    }

    if (WHITELIST_TOKENS.includes(token1.id)) {
      token0.whitelistPools.push(pool);
    }

    // Skipping adding createdAtTimestamp field as it is not queried in frontend subgraph.

    // Save entities to DB.
    await this._db.saveToken(token0, block);
    await this._db.saveToken(token1, block);
    await this._db.saveFactory(factory, block);
  }

  /**
   * Create new Token.
   * @param tokenAddress
   */
  async _createToken (block: Block, tokenAddress: string): Promise<Token> {
    const token = new Token();
    token.id = tokenAddress;

    const { value: symbol } = await this._erc20Client.getSymbol(block.hash, tokenAddress);
    const { value: name } = await this._erc20Client.getName(block.hash, tokenAddress);
    const { value: totalSupply } = await this._erc20Client.getTotalSupply(block.hash, tokenAddress);

    // TODO: Decimals not implemented by erc20-watcher.
    // const { value: decimals } = await this._erc20Client.getDecimals(blockHash, tokenAddress);

    token.symbol = symbol;
    token.name = name;
    token.totalSupply = totalSupply;

    return this._db.saveToken(token, block);
  }

  async _handleInitialize (block: Block, contractAddress: string, tx: Transaction, initializeEvent: InitializeEvent): Promise<void> {
    const { sqrtPriceX96, tick } = initializeEvent;
    const pool = await this._db.getPool({ id: contractAddress, blockHash: block.hash });
    assert(pool, `Pool ${contractAddress} not found.`);

    // Update Pool.
    pool.sqrtPrice = BigInt(sqrtPriceX96);
    pool.tick = BigInt(tick);
    this._db.savePool(pool, block);

    // Update token prices.
    const [token0, token1] = await Promise.all([
      this._db.getToken({ id: pool.token0.id, blockHash: block.hash }),
      this._db.getToken({ id: pool.token1.id, blockHash: block.hash })
    ]);

    // Update ETH price now that prices could have changed.
    const bundle = await this._db.getBundle({ id: '1', blockHash: block.hash });
    assert(bundle);
    bundle.ethPriceUSD = await getEthPriceInUSD(this._db, block);
    this._db.saveBundle(bundle, block);

    await updatePoolDayData(this._db, { contractAddress, block });
    await updatePoolHourData(this._db, { contractAddress, block });

    assert(token0 && token1, 'Pool tokens not found.');

    token0.derivedETH = await findEthPerToken(token0);
    token1.derivedETH = await findEthPerToken(token1);

    await Promise.all([
      this._db.saveToken(token0, block),
      this._db.saveToken(token1, block)
    ]);
  }

  async _handleMint (block: Block, contractAddress: string, tx: Transaction, mintEvent: MintEvent): Promise<void> {
    const bundle = await this._db.getBundle({ id: '1', blockHash: block.hash });
    assert(bundle);
    const poolAddress = contractAddress;
    const pool = await this._db.getPool({ id: poolAddress, blockHash: block.hash });
    assert(pool);

    // TODO: In subgraph factory is fetched by hardcoded factory address.
    // Currently fetching first factory in database as only one exists.
    const [factory] = await this._db.getFactories({ blockHash: block.hash }, { limit: 1 });

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

    const transaction = await loadTransaction(this._db, { block, tx });

    const mint = new Mint();
    mint.id = transaction.id + '#' + pool.txCount.toString();
    mint.transaction = transaction;
    mint.timestamp = transaction.timestamp;
    mint.pool = pool;
    mint.token0 = pool.token0;
    mint.token1 = pool.token1;
    mint.owner = mintEvent.owner;
    mint.sender = mintEvent.sender;

    // TODO: Assign origin with Transaction from address.
    // origin: event.transaction.from

    mint.amount = mintEvent.amount;
    mint.amount0 = amount0;
    mint.amount1 = amount1;
    mint.amountUSD = amountUSD;
    mint.tickLower = mintEvent.tickLower;
    mint.tickUpper = mintEvent.tickUpper;

    // Tick entities.
    const lowerTickIdx = mintEvent.tickLower;
    const upperTickIdx = mintEvent.tickUpper;

    const lowerTickId = poolAddress + '#' + mintEvent.tickLower.toString();
    const upperTickId = poolAddress + '#' + mintEvent.tickUpper.toString();

    let lowerTick = await this._db.getTick({ id: lowerTickId, blockHash: block.hash });
    let upperTick = await this._db.getTick({ id: upperTickId, blockHash: block.hash });

    if (!lowerTick) {
      lowerTick = await createTick(this._db, lowerTickId, BigInt(lowerTickIdx), pool, block);
    }

    if (!upperTick) {
      upperTick = await createTick(this._db, upperTickId, BigInt(upperTickIdx), pool, block);
    }

    const amount = BigInt(mintEvent.amount);
    lowerTick.liquidityGross = BigInt(lowerTick.liquidityGross) + amount;
    lowerTick.liquidityNet = BigInt(lowerTick.liquidityNet) + amount;
    upperTick.liquidityGross = BigInt(upperTick.liquidityGross) + amount;
    upperTick.liquidityNet = BigInt(upperTick.liquidityNet) + amount;

    // TODO: Update Tick's volume, fees, and liquidity provider count.
    // Computing these on the tick level requires reimplementing some of the swapping code from v3-core.

    await updateUniswapDayData(this._db, { block, contractAddress });
    await updatePoolDayData(this._db, { block, contractAddress });
    await updatePoolHourData(this._db, { block, contractAddress });
    await updateTokenDayData(this._db, token0, { block });
    await updateTokenDayData(this._db, token1, { block });
    await updateTokenHourData(this._db, token0, { block });
    await updateTokenHourData(this._db, token1, { block });

    await Promise.all([
      this._db.saveToken(token0, block),
      this._db.saveToken(token1, block)
    ]);

    await this._db.savePool(pool, block);
    await this._db.saveFactory(factory, block);
    await this._db.saveMint(mint, block);

    await Promise.all([
      await this._db.saveTick(lowerTick, block),
      await this._db.saveTick(upperTick, block)
    ]);

    // Skipping update inner tick vars and tick day data as they are not queried.
  }

  async _handleBurn (block: Block, contractAddress: string, tx: Transaction, burnEvent: BurnEvent): Promise<void> {
    const bundle = await this._db.getBundle({ id: '1', blockHash: block.hash });
    assert(bundle);
    const poolAddress = contractAddress;
    const pool = await this._db.getPool({ id: poolAddress, blockHash: block.hash });
    assert(pool);

    // TODO: In subgraph factory is fetched by hardcoded factory address.
    // Currently fetching first factory in database as only one exists.
    const [factory] = await this._db.getFactories({ blockHash: block.hash }, { limit: 1 });

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
    const transaction = await loadTransaction(this._db, { block, tx });

    const burn = new Burn();
    burn.id = transaction.id + '#' + pool.txCount.toString();
    burn.transaction = transaction;
    burn.timestamp = transaction.timestamp;
    burn.pool = pool;
    burn.token0 = pool.token0;
    burn.token1 = pool.token1;
    burn.owner = burnEvent.owner;

    // TODO: Assign origin with Transaction from address.
    // origin: event.transaction.from

    burn.amount = burnEvent.amount;
    burn.amount0 = amount0;
    burn.amount1 = amount1;
    burn.amountUSD = amountUSD;
    burn.tickLower = burnEvent.tickLower;
    burn.tickUpper = burnEvent.tickUpper;

    // Tick entities.
    const lowerTickId = poolAddress + '#' + (burnEvent.tickLower).toString();
    const upperTickId = poolAddress + '#' + (burnEvent.tickUpper).toString();
    const lowerTick = await this._db.getTick({ id: lowerTickId, blockHash: block.hash });
    const upperTick = await this._db.getTick({ id: upperTickId, blockHash: block.hash });
    assert(lowerTick && upperTick);
    const amount = BigInt(burnEvent.amount);
    lowerTick.liquidityGross = BigInt(lowerTick.liquidityGross) - amount;
    lowerTick.liquidityNet = BigInt(lowerTick.liquidityNet) - amount;
    upperTick.liquidityGross = BigInt(upperTick.liquidityGross) - amount;
    upperTick.liquidityNet = BigInt(upperTick.liquidityNet) + amount;

    await updateUniswapDayData(this._db, { block, contractAddress });
    await updatePoolDayData(this._db, { block, contractAddress });
    await updatePoolHourData(this._db, { block, contractAddress });
    await updateTokenDayData(this._db, token0, { block });
    await updateTokenDayData(this._db, token0, { block });
    await updateTokenHourData(this._db, token0, { block });
    await updateTokenHourData(this._db, token0, { block });

    // Skipping update Tick fee and Tick day data as they are not queried.

    await Promise.all([
      await this._db.saveTick(lowerTick, block),
      await this._db.saveTick(upperTick, block)
    ]);

    await Promise.all([
      this._db.saveToken(token0, block),
      this._db.saveToken(token1, block)
    ]);

    await this._db.savePool(pool, block);
    await this._db.saveFactory(factory, block);
    await this._db.saveBurn(burn, block);
  }

  async _handleSwap (block: Block, contractAddress: string, tx: Transaction, swapEvent: SwapEvent): Promise<void> {
    const bundle = await this._db.getBundle({ id: '1', blockHash: block.hash });
    assert(bundle);

    // TODO: In subgraph factory is fetched by hardcoded factory address.
    // Currently fetching first factory in database as only one exists.
    const [factory] = await this._db.getFactories({ blockHash: block.hash }, { limit: 1 });

    const pool = await this._db.getPool({ id: contractAddress, blockHash: block.hash });
    assert(pool);

    // Hot fix for bad pricing.
    if (pool.id === '0x9663f2ca0454accad3e094448ea6f77443880454') {
      return;
    }

    const [token0, token1] = await Promise.all([
      this._db.getToken({ id: pool.token0.id, blockHash: block.hash }),
      this._db.getToken({ id: pool.token1.id, blockHash: block.hash })
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
    this._db.savePool(pool, block);

    // Update USD pricing.
    bundle.ethPriceUSD = await getEthPriceInUSD(this._db, block);
    this._db.saveBundle(bundle, block);
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
    const transaction = await loadTransaction(this._db, { block, tx });

    const swap = new Swap();
    swap.id = transaction.id + '#' + pool.txCount.toString();
    swap.transaction = transaction;
    swap.timestamp = transaction.timestamp;
    swap.pool = pool;
    swap.token0 = pool.token0;
    swap.token1 = pool.token1;
    swap.sender = swapEvent.sender;

    // TODO: Assign origin with Transaction from address.
    // origin: event.transaction.from

    swap.recipient = swapEvent.recipient;
    swap.amount0 = amount0;
    swap.amount1 = amount1;
    swap.amountUSD = amountTotalUSDTracked;
    swap.tick = BigInt(swapEvent.tick);
    swap.sqrtPriceX96 = swapEvent.sqrtPriceX96;

    // Skipping update pool fee growth as they are not queried.

    // Interval data.
    const uniswapDayData = await updateUniswapDayData(this._db, { block, contractAddress });
    const poolDayData = await updatePoolDayData(this._db, { block, contractAddress });
    const poolHourData = await updatePoolHourData(this._db, { block, contractAddress });
    const token0DayData = await updateTokenDayData(this._db, token0, { block });
    const token1DayData = await updateTokenDayData(this._db, token0, { block });
    const token0HourData = await updateTokenHourData(this._db, token0, { block });
    const token1HourData = await updateTokenHourData(this._db, token0, { block });

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

    await this._db.saveSwap(swap, block);
    await this._db.saveTokenDayData(token0DayData, block);
    await this._db.saveTokenDayData(token1DayData, block);
    await this._db.saveUniswapDayData(uniswapDayData, block);
    await this._db.savePoolDayData(poolDayData, block);
    await this._db.saveFactory(factory, block);
    await this._db.savePool(pool, block);
    await this._db.saveToken(token0, block);
    await this._db.saveToken(token1, block);

    // Skipping update of inner vars of current or crossed ticks as they are not queried.
  }

  async _handleIncreaseLiquidity (block: Block, contractAddress: string, tx: Transaction, event: IncreaseLiquidityEvent): Promise<void> {
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

    await this._db.savePosition(position, block);

    await this._savePositionSnapshot(position, block, tx);
  }

  async _handleDecreaseLiquidity (block: Block, contractAddress: string, tx: Transaction, event: DecreaseLiquidityEvent): Promise<void> {
    let position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));

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

    position = await this._updateFeeVars(position, block, contractAddress, BigInt(event.tokenId));

    await this._db.savePosition(position, block);

    await this._savePositionSnapshot(position, block, tx);
  }

  async _handleCollect (block: Block, contractAddress: string, tx: Transaction, event: CollectEvent): Promise<void> {
    let position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));

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
    position.collectedFeesToken0 = position.collectedFeesToken0.plus(amount0);
    position.collectedFeesToken1 = position.collectedFeesToken1.plus(amount1);

    position = await this._updateFeeVars(position, block, contractAddress, BigInt(event.tokenId));

    await this._db.savePosition(position, block);

    await this._savePositionSnapshot(position, block, tx);
  }

  async _handleTransfer (block: Block, contractAddress: string, tx: Transaction, event: TransferEvent): Promise<void> {
    const position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));
    // Position was not able to be fetched.
    if (position === null) {
      return;
    }

    position.owner = event.to;
    await this._db.savePosition(position, block);

    await this._savePositionSnapshot(position, block, tx);
  }

  async _getPosition (block: Block, contractAddress: string, tx: Transaction, tokenId: bigint): Promise<Position | null> {
    const { hash: blockHash } = block;
    let position = await this._db.getPosition({ id: tokenId.toString(), blockHash });

    if (!position) {
      const nfpmPosition = await this._uniClient.getPosition(blockHash, tokenId);

      // The contract call reverts in situations where the position is minted and deleted in the same block.
      // From my investigation this happens in calls from BancorSwap.
      // (e.g. 0xf7867fa19aa65298fadb8d4f72d0daed5e836f3ba01f0b9b9631cdc6c36bed40)

      if (nfpmPosition) {
        const { token0: token0Address, token1: token1Address, fee } = await this._uniClient.poolIdToPoolKey(blockHash, nfpmPosition.poolId);

        const { pool: poolAddress } = await this._uniClient.getPool(blockHash, token0Address, token1Address, fee);

        position = new Position();
        position.id = tokenId.toString();

        const pool = await this._db.getPool({ id: poolAddress, blockHash });
        assert(pool);
        position.pool = pool;

        const [token0, token1] = await Promise.all([
          this._db.getToken({ id: token0Address, blockHash }),
          this._db.getToken({ id: token0Address, blockHash })
        ]);
        assert(token0 && token1);
        position.token0 = token0;
        position.token1 = token1;

        const [tickLower, tickUpper] = await Promise.all([
          this._db.getTick({ id: poolAddress.concat('#').concat(nfpmPosition.tickLower.toString()), blockHash }),
          this._db.getTick({ id: poolAddress.concat('#').concat(nfpmPosition.tickUpper.toString()), blockHash })
        ]);
        assert(tickLower && tickUpper);
        position.tickLower = tickLower;
        position.tickUpper = tickUpper;

        const transaction = await loadTransaction(this._db, { block, tx });
        position.transaction = transaction;

        position.feeGrowthInside0LastX128 = BigInt(nfpmPosition.feeGrowthInside0LastX128.toString());
        position.feeGrowthInside1LastX128 = BigInt(nfpmPosition.feeGrowthInside1LastX128.toString());

        position = await this._db.savePosition(position, block);
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
    const positionSnapshot = new PositionSnapshot();
    positionSnapshot.id = position.id.concat('#').concat(block.number.toString());
    positionSnapshot.blockNumber = block.number;
    positionSnapshot.owner = position.owner;
    positionSnapshot.pool = position.pool;
    positionSnapshot.position = position;
    positionSnapshot.timestamp = BigInt(block.timestamp);
    positionSnapshot.liquidity = position.liquidity;
    positionSnapshot.depositedToken0 = position.depositedToken0;
    positionSnapshot.depositedToken1 = position.depositedToken1;
    positionSnapshot.withdrawnToken0 = position.withdrawnToken0;
    positionSnapshot.withdrawnToken1 = position.withdrawnToken1;
    positionSnapshot.collectedFeesToken0 = position.collectedFeesToken0;
    positionSnapshot.collectedFeesToken1 = position.collectedFeesToken1;
    positionSnapshot.transaction = await loadTransaction(this._db, { block, tx });
    positionSnapshot.feeGrowthInside0LastX128 = position.feeGrowthInside0LastX128;
    positionSnapshot.feeGrowthInside1LastX128 = position.feeGrowthInside1LastX128;

    await this._db.savePositionSnapshot(positionSnapshot, block);
  }
}
