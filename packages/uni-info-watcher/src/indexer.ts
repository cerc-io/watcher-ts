//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial, FindConditions, FindManyOptions, QueryRunner } from 'typeorm';
import JSONbig from 'json-bigint';
import { providers, utils, BigNumber } from 'ethers';

import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { IndexerInterface, Indexer as BaseIndexer, QueryOptions, OrderDirection, BlockHeight, Relation, GraphDecimal, JobQueue, Where } from '@vulcanize/util';

import { findEthPerToken, getEthPriceInUSD, getTrackedAmountUSD, sqrtPriceX96ToTokenPrices, WHITELIST_TOKENS } from './utils/pricing';
import { updatePoolDayData, updatePoolHourData, updateTickDayData, updateTokenDayData, updateTokenHourData, updateUniswapDayData } from './utils/interval-updates';
import { Token } from './entity/Token';
import { convertTokenToDecimal, loadTransaction, safeDiv } from './utils';
import { createTick, feeTierToTickSpacing } from './utils/tick';
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
import { Tick } from './entity/Tick';

const SYNC_DELTA = 5;

const log = debug('vulcanize:indexer');

export { OrderDirection, BlockHeight };

export class Indexer implements IndexerInterface {
  _db: Database
  _uniClient: UniClient
  _erc20Client: ERC20Client
  _ethClient: EthClient
  _postgraphileClient: EthClient
  _baseIndexer: BaseIndexer
  _isDemo: boolean

  constructor (db: Database, uniClient: UniClient, erc20Client: ERC20Client, ethClient: EthClient, postgraphileClient: EthClient, ethProvider: providers.BaseProvider, jobQueue: JobQueue, mode: string) {
    assert(db);
    assert(uniClient);
    assert(erc20Client);
    assert(postgraphileClient);

    this._db = db;
    this._uniClient = uniClient;
    this._erc20Client = erc20Client;
    this._ethClient = ethClient;
    this._postgraphileClient = postgraphileClient;
    this._baseIndexer = new BaseIndexer(this._db, this._ethClient, this._postgraphileClient, ethProvider, jobQueue);
    this._isDemo = mode === 'demo';
  }

  getResultEvent (event: Event): ResultEvent {
    const block = event.block;
    const eventFields = JSON.parse(event.eventInfo);
    const { tx, eventIndex } = JSON.parse(event.extraInfo);

    return {
      block: {
        hash: block.blockHash,
        number: block.blockNumber,
        timestamp: block.blockTimestamp,
        parentHash: block.parentHash
      },

      tx,
      contract: event.contract,
      eventIndex,

      event: {
        __typename: event.eventName,
        ...eventFields
      },

      proof: JSON.parse(event.proof)
    };
  }

  async processEvent (dbEvent: Event): Promise<void> {
    console.time('time:indexer#processEvent-mapping_code');
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
    console.timeEnd('time:indexer#processEvent-mapping_code');
  }

  async getBlockEntities (where: { [key: string]: any } = {}, queryOptions: QueryOptions): Promise<any> {
    if (where.timestamp_gt) {
      where.blockTimestamp_gt = where.timestamp_gt;
      delete where.timestamp_gt;
    }

    if (where.timestamp_lt) {
      where.blockTimestamp_lt = where.timestamp_lt;
      delete where.timestamp_lt;
    }

    if (queryOptions.orderBy === 'timestamp') {
      queryOptions.orderBy = 'blockTimestamp';
    }

    const blocks = await this.getEntities(BlockProgress, {}, where, queryOptions);

    return blocks.map(block => ({
      timestamp: block.blockTimestamp,
      number: block.blockNumber,
      hash: block.blockHash
    }));
  }

  async getIndexingStatus (): Promise<any> {
    const syncStatus = await this.getSyncStatus();
    assert(syncStatus);
    const synced = (syncStatus.chainHeadBlockNumber - syncStatus.latestIndexedBlockNumber) <= SYNC_DELTA;

    return {
      synced,
      health: 'healthy',
      chains: [
        {
          chainHeadBlock: {
            number: syncStatus.chainHeadBlockNumber,
            hash: syncStatus.chainHeadBlockHash
          },
          latestBlock: {
            number: syncStatus.latestIndexedBlockNumber,
            hash: syncStatus.latestIndexedBlockHash
          }
        }
      ]
    };
  }

  async saveEventEntity (dbEvent: Event): Promise<Event> {
    return this._baseIndexer.saveEventEntity(dbEvent);
  }

  async markBlocksAsPruned (blocks: BlockProgress[]): Promise<void> {
    return this._baseIndexer.markBlocksAsPruned(blocks);
  }

  async getBundle (id: string, block: BlockHeight): Promise<Bundle | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.getBundle(dbTx, { id, blockHash: block.hash, blockNumber: block.number });
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getPool (id: string, block: BlockHeight): Promise<Pool | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.getPool(dbTx, { id, blockHash: block.hash, blockNumber: block.number });
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getToken (id: string, block: BlockHeight): Promise<Token | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.getToken(dbTx, { id, blockHash: block.hash, blockNumber: block.number });
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getEntities<Entity> (entity: new () => Entity, block: BlockHeight, where: { [key: string]: any } = {}, queryOptions: QueryOptions, relations?: Relation[]): Promise<Entity[]> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      where = Object.entries(where).reduce((acc: { [key: string]: any }, [fieldWithSuffix, value]) => {
        const [field, ...suffix] = fieldWithSuffix.split('_');

        if (!acc[field]) {
          acc[field] = [];
        }

        const filter = {
          value,
          not: false,
          operator: 'equals'
        };

        let operator = suffix.shift();

        if (operator === 'not') {
          filter.not = true;
          operator = suffix.shift();
        }

        if (operator) {
          filter.operator = operator;
        }

        acc[field].push(filter);

        return acc;
      }, {});

      res = await this._db.getModelEntities(dbTx, entity, block, where, queryOptions, relations);
      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseIndexer.getAncestorAtDepth(blockHash, depth);
  }

  async fetchBlockEvents (block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    return this._baseIndexer.fetchBlockEvents(block, this._fetchAndSaveEvents.bind(this));
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<Event>> {
    return this._baseIndexer.getBlockEvents(blockHash, where, queryOptions);
  }

  async removeUnknownEvents (block: BlockProgress): Promise<void> {
    return this._baseIndexer.removeUnknownEvents(Event, block);
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusIndexedBlock(blockHash, blockNumber, force);
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusChainHead(blockHash, blockNumber);
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusCanonicalBlock(blockHash, blockNumber, force);
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._baseIndexer.getSyncStatus();
  }

  async getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any> {
    return this._baseIndexer.getBlocks(blockFilter);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._baseIndexer.getEvent(id);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._baseIndexer.getBlockProgress(blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgress>, options: FindManyOptions<BlockProgress>): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlockProgressEntities(where, options);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlocksAtHeight(height, isPruned);
  }

  async updateBlockProgress (block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    return this._baseIndexer.updateBlockProgress(block, lastProcessedEventIndex);
  }

  async _fetchAndSaveEvents (block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    assert(block.blockHash);

    console.time('time:indexer#_fetchAndSaveEvents-uni_watcher');
    const events = await this._uniClient.getEvents(block.blockHash);
    console.timeEnd('time:indexer#_fetchAndSaveEvents-uni_watcher');

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
      const extraInfo = { tx, eventIndex };

      dbEvents.push({
        index: i,
        txHash: tx.hash,
        contract,
        eventName,
        eventInfo: JSONbig.stringify(eventInfo),
        extraInfo: JSONbig.stringify(extraInfo),
        proof: JSONbig.stringify(proof)
      });
    }

    const dbTx = await this._db.createTransactionRunner();

    try {
      const blockProgress = await this._db.saveEvents(dbTx, block, dbEvents);
      await dbTx.commitTransaction();

      return blockProgress;
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handlePoolCreated (block: Block, contractAddress: string, tx: Transaction, poolCreatedEvent: PoolCreatedEvent): Promise<void> {
    const { token0: token0Address, token1: token1Address, fee, pool: poolAddress } = poolCreatedEvent;

    // Temp fix from Subgraph mapping code.
    if (utils.getAddress(poolAddress) === utils.getAddress('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
      return;
    }

    // Get Tokens.
    let [token0, token1] = await Promise.all([
      this._db.getTokenNoTx({ blockHash: block.hash, id: token0Address }),
      this._db.getTokenNoTx({ blockHash: block.hash, id: token1Address })
    ]);

    // Create Tokens if not present.
    if (!token0) {
      token0 = await this._initToken(block, token0Address);
    }

    if (!token1) {
      token1 = await this._initToken(block, token1Address);
    }

    // Bail if we couldn't figure out the decimals.
    if (token0.decimals === null || token1.decimals === null) {
      log('mybug the decimal on token was null');
      return;
    }

    // Save entities to DB.
    const dbTx = await this._db.createTransactionRunner();

    try {
      // Load factory.
      let factory = await this._db.getFactory(dbTx, { blockHash: block.hash, id: contractAddress });

      if (!factory) {
        factory = new Factory();
        factory.id = contractAddress;
        factory = await this._db.saveFactory(dbTx, factory, block);

        // Create new bundle for tracking eth price.
        const bundle = new Bundle();
        bundle.id = '1';
        await this._db.saveBundle(dbTx, bundle, block);
      }

      // Update Factory.
      factory.poolCount = BigInt(factory.poolCount) + BigInt(1);

      let pool = new Pool();
      pool.id = poolAddress;

      token0 = await this._db.saveToken(dbTx, token0, block);
      token1 = await this._db.saveToken(dbTx, token1, block);
      token0 = await this._db.getToken(dbTx, token0);
      token1 = await this._db.getToken(dbTx, token1);
      assert(token0);
      assert(token1);

      pool.token0 = token0;
      pool.token1 = token1;
      pool.feeTier = BigInt(fee);

      // Skipping adding createdAtTimestamp field as it is not queried in frontend subgraph.

      pool = await this._db.savePool(dbTx, pool, block);

      // Update white listed pools.
      if (WHITELIST_TOKENS.includes(token0.id) || this._isDemo) {
        token1.whitelistPools.push(pool);
      }

      if (WHITELIST_TOKENS.includes(token1.id) || this._isDemo) {
        token0.whitelistPools.push(pool);
      }

      token0 = await this._db.saveToken(dbTx, token0, block);
      token1 = await this._db.saveToken(dbTx, token1, block);
      pool.token0 = token0;
      pool.token1 = token1;
      await this._db.savePool(dbTx, pool, block);
      await this._db.saveFactory(dbTx, factory, block);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  /**
   * Create new Token.
   * @param tokenAddress
   */
  async _initToken (block: Block, tokenAddress: string): Promise<Token> {
    const token = new Token();
    token.id = tokenAddress;

    console.time('time:indexer#_initToken-eth_call_for_token');
    const symbolPromise = this._erc20Client.getSymbol(block.hash, tokenAddress);
    const namePromise = this._erc20Client.getName(block.hash, tokenAddress);
    const totalSupplyPromise = this._erc20Client.getTotalSupply(block.hash, tokenAddress);
    const decimalsPromise = this._erc20Client.getDecimals(block.hash, tokenAddress);

    const [
      { value: symbol },
      { value: name },
      { value: totalSupply },
      { value: decimals }
    ] = await Promise.all([symbolPromise, namePromise, totalSupplyPromise, decimalsPromise]);

    console.timeEnd('time:indexer#_initToken-eth_call_for_token');

    token.symbol = symbol;
    token.name = name;
    token.totalSupply = totalSupply;
    token.decimals = decimals;

    return token;
  }

  async _handleInitialize (block: Block, contractAddress: string, tx: Transaction, initializeEvent: InitializeEvent): Promise<void> {
    const { sqrtPriceX96, tick } = initializeEvent;
    const dbTx = await this._db.createTransactionRunner();

    try {
      const pool = await this._db.getPool(dbTx, { id: contractAddress, blockHash: block.hash });
      assert(pool, `Pool ${contractAddress} not found.`);

      // Update Pool.
      pool.sqrtPrice = BigInt(sqrtPriceX96);
      pool.tick = BigInt(tick);

      // Update ETH price now that prices could have changed.
      const bundle = await this._db.getBundle(dbTx, { id: '1', blockHash: block.hash });
      assert(bundle);
      bundle.ethPriceUSD = await getEthPriceInUSD(this._db, dbTx, block, this._isDemo);

      // Update token prices.
      const [token0, token1] = await Promise.all([
        this._db.getToken(dbTx, { id: pool.token0.id, blockHash: block.hash }),
        this._db.getToken(dbTx, { id: pool.token1.id, blockHash: block.hash })
      ]);

      assert(token0 && token1, 'Pool tokens not found.');

      token0.derivedETH = await findEthPerToken(this._db, dbTx, token0, this._isDemo);
      token1.derivedETH = await findEthPerToken(this._db, dbTx, token1, this._isDemo);

      pool.token0 = token0;
      pool.token1 = token1;
      await this._db.savePool(dbTx, pool, block);
      await this._db.saveBundle(dbTx, bundle, block);

      await updatePoolDayData(this._db, dbTx, { contractAddress, block });
      await updatePoolHourData(this._db, dbTx, { contractAddress, block });

      await Promise.all([
        this._db.saveToken(dbTx, token0, block),
        this._db.saveToken(dbTx, token1, block)
      ]);

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleMint (block: Block, contractAddress: string, tx: Transaction, mintEvent: MintEvent): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      const bundle = await this._db.getBundle(dbTx, { id: '1', blockHash: block.hash });
      assert(bundle);
      const poolAddress = contractAddress;
      let pool = await this._db.getPool(dbTx, { id: poolAddress, blockHash: block.hash });
      assert(pool);

      // TODO: In subgraph factory is fetched by hardcoded factory address.
      // Currently fetching first factory in database as only one exists.
      const [factory] = await this._db.getModelEntities(dbTx, Factory, { hash: block.hash }, {}, { limit: 1 });

      let token0 = await this._db.getToken(dbTx, pool.token0);
      let token1 = await this._db.getToken(dbTx, pool.token1);
      assert(token0);
      assert(token1);
      const amount0 = convertTokenToDecimal(BigInt(mintEvent.amount0), BigInt(token0.decimals));
      const amount1 = convertTokenToDecimal(BigInt(mintEvent.amount1), BigInt(token1.decimals));

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

      const transaction = await loadTransaction(this._db, dbTx, { block, tx });

      const mint = new Mint();
      mint.id = transaction.id + '#' + pool.txCount.toString();
      mint.transaction = transaction;
      mint.timestamp = transaction.timestamp;
      mint.pool = pool;
      mint.token0 = pool.token0;
      mint.token1 = pool.token1;
      mint.owner = mintEvent.owner;
      mint.sender = mintEvent.sender;
      mint.origin = tx.from;
      mint.amount = BigInt(mintEvent.amount);
      mint.amount0 = amount0;
      mint.amount1 = amount1;
      mint.amountUSD = amountUSD;
      mint.tickLower = BigInt(mintEvent.tickLower);
      mint.tickUpper = BigInt(mintEvent.tickUpper);

      // Tick entities.
      const lowerTickIdx = mintEvent.tickLower;
      const upperTickIdx = mintEvent.tickUpper;

      const lowerTickId = poolAddress + '#' + mintEvent.tickLower.toString();
      const upperTickId = poolAddress + '#' + mintEvent.tickUpper.toString();

      let lowerTick = await this._db.getTick(dbTx, { id: lowerTickId, blockHash: block.hash });
      let upperTick = await this._db.getTick(dbTx, { id: upperTickId, blockHash: block.hash });

      if (!lowerTick) {
        lowerTick = await createTick(this._db, dbTx, lowerTickId, BigInt(lowerTickIdx), pool, block);
      }

      if (!upperTick) {
        upperTick = await createTick(this._db, dbTx, upperTickId, BigInt(upperTickIdx), pool, block);
      }

      const amount = BigInt(mintEvent.amount);
      lowerTick.liquidityGross = BigInt(lowerTick.liquidityGross) + amount;
      lowerTick.liquidityNet = BigInt(lowerTick.liquidityNet) + amount;
      upperTick.liquidityGross = BigInt(upperTick.liquidityGross) + amount;
      upperTick.liquidityNet = BigInt(upperTick.liquidityNet) + amount;

      // TODO: Update Tick's volume, fees, and liquidity provider count.
      // Computing these on the tick level requires reimplementing some of the swapping code from v3-core.

      await updateUniswapDayData(this._db, dbTx, { block, contractAddress });
      await updateTokenDayData(this._db, dbTx, token0, { block });
      await updateTokenDayData(this._db, dbTx, token1, { block });
      await updateTokenHourData(this._db, dbTx, token0, { block });
      await updateTokenHourData(this._db, dbTx, token1, { block });

      await updatePoolDayData(this._db, dbTx, { block, contractAddress });
      await updatePoolHourData(this._db, dbTx, { block, contractAddress });

      [token0, token1] = await Promise.all([
        this._db.saveToken(dbTx, token0, block),
        this._db.saveToken(dbTx, token1, block)
      ]);

      pool.token0 = token0;
      pool.token1 = token1;

      pool = await this._db.savePool(dbTx, pool, block);
      await this._db.saveFactory(dbTx, factory, block);

      mint.pool = pool;
      mint.token0 = token0;
      mint.token1 = token1;
      await this._db.saveMint(dbTx, mint, block);

      lowerTick.pool = pool;
      upperTick.pool = pool;
      await Promise.all([
        await this._db.saveTick(dbTx, lowerTick, block),
        await this._db.saveTick(dbTx, upperTick, block)
      ]);

      // Update inner tick vars and save the ticks.
      await this._updateTickFeeVarsAndSave(dbTx, lowerTick, block);
      await this._updateTickFeeVarsAndSave(dbTx, upperTick, block);

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleBurn (block: Block, contractAddress: string, tx: Transaction, burnEvent: BurnEvent): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      const bundle = await this._db.getBundle(dbTx, { id: '1', blockHash: block.hash });
      assert(bundle);
      const poolAddress = contractAddress;
      let pool = await this._db.getPool(dbTx, { id: poolAddress, blockHash: block.hash });
      assert(pool);

      // TODO: In subgraph factory is fetched by hardcoded factory address.
      // Currently fetching first factory in database as only one exists.
      const [factory] = await this._db.getModelEntities(dbTx, Factory, { hash: block.hash }, {}, { limit: 1 });

      let token0 = await this._db.getToken(dbTx, pool.token0);
      let token1 = await this._db.getToken(dbTx, pool.token1);
      assert(token0);
      assert(token1);
      const amount0 = convertTokenToDecimal(BigInt(burnEvent.amount0), BigInt(token0.decimals));
      const amount1 = convertTokenToDecimal(BigInt(burnEvent.amount1), BigInt(token1.decimals));

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
      if (pool.tick !== null) {
        if (
          BigInt(burnEvent.tickLower) <= BigInt(pool.tick) &&
          BigInt(burnEvent.tickUpper) > BigInt(pool.tick)
        ) {
          pool.liquidity = BigInt(pool.liquidity) - BigInt(burnEvent.amount);
        }
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
      const transaction = await loadTransaction(this._db, dbTx, { block, tx });

      const burn = new Burn();
      burn.id = transaction.id + '#' + pool.txCount.toString();
      burn.transaction = transaction;
      burn.timestamp = transaction.timestamp;
      burn.pool = pool;
      burn.token0 = pool.token0;
      burn.token1 = pool.token1;
      burn.owner = burnEvent.owner;
      burn.origin = tx.from;
      burn.amount = BigInt(burnEvent.amount);
      burn.amount0 = amount0;
      burn.amount1 = amount1;
      burn.amountUSD = amountUSD;
      burn.tickLower = BigInt(burnEvent.tickLower);
      burn.tickUpper = BigInt(burnEvent.tickUpper);

      // Tick entities.
      const lowerTickId = poolAddress + '#' + (burnEvent.tickLower).toString();
      const upperTickId = poolAddress + '#' + (burnEvent.tickUpper).toString();
      const lowerTick = await this._db.getTick(dbTx, { id: lowerTickId, blockHash: block.hash });
      const upperTick = await this._db.getTick(dbTx, { id: upperTickId, blockHash: block.hash });
      assert(lowerTick && upperTick);
      const amount = BigInt(burnEvent.amount);
      lowerTick.liquidityGross = BigInt(lowerTick.liquidityGross) - amount;
      lowerTick.liquidityNet = BigInt(lowerTick.liquidityNet) - amount;
      upperTick.liquidityGross = BigInt(upperTick.liquidityGross) - amount;
      upperTick.liquidityNet = BigInt(upperTick.liquidityNet) + amount;

      await updateUniswapDayData(this._db, dbTx, { block, contractAddress });
      await updateTokenDayData(this._db, dbTx, token0, { block });
      await updateTokenDayData(this._db, dbTx, token0, { block });
      await updateTokenHourData(this._db, dbTx, token0, { block });
      await updateTokenHourData(this._db, dbTx, token0, { block });
      await updatePoolDayData(this._db, dbTx, { block, contractAddress });
      await updatePoolHourData(this._db, dbTx, { block, contractAddress });
      await this._updateTickFeeVarsAndSave(dbTx, lowerTick, block);
      await this._updateTickFeeVarsAndSave(dbTx, upperTick, block);

      [token0, token1] = await Promise.all([
        this._db.saveToken(dbTx, token0, block),
        this._db.saveToken(dbTx, token1, block)
      ]);

      pool.token0 = token0;
      pool.token1 = token1;
      pool = await this._db.savePool(dbTx, pool, block);
      await this._db.saveFactory(dbTx, factory, block);

      // Skipping update Tick fee and Tick day data as they are not queried.

      lowerTick.pool = pool;
      upperTick.pool = pool;
      await Promise.all([
        await this._db.saveTick(dbTx, lowerTick, block),
        await this._db.saveTick(dbTx, upperTick, block)
      ]);

      burn.pool = pool;
      burn.token0 = token0;
      burn.token1 = token1;
      await this._db.saveBurn(dbTx, burn, block);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleSwap (block: Block, contractAddress: string, tx: Transaction, swapEvent: SwapEvent): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      let bundle = await this._db.getBundle(dbTx, { id: '1', blockHash: block.hash });
      assert(bundle);

      // TODO: In subgraph factory is fetched by hardcoded factory address.
      // Currently fetching first factory in database as only one exists.
      const [factory] = await this._db.getModelEntities(dbTx, Factory, { hash: block.hash }, {}, { limit: 1 });

      let pool = await this._db.getPool(dbTx, { id: contractAddress, blockHash: block.hash });
      assert(pool);

      // Hot fix for bad pricing.
      if (pool.id === '0x9663f2ca0454accad3e094448ea6f77443880454') {
        return;
      }

      let [token0, token1] = await Promise.all([
        this._db.getToken(dbTx, { id: pool.token0.id, blockHash: block.hash }),
        this._db.getToken(dbTx, { id: pool.token1.id, blockHash: block.hash })
      ]);

      assert(token0 && token1, 'Pool tokens not found.');

      const oldTick = pool.tick;
      assert(oldTick);

      // Amounts - 0/1 are token deltas. Can be positive or negative.
      const amount0 = convertTokenToDecimal(BigInt(swapEvent.amount0), BigInt(token0.decimals));
      const amount1 = convertTokenToDecimal(BigInt(swapEvent.amount1), BigInt(token1.decimals));

      // Need absolute amounts for volume.
      let amount0Abs = amount0;
      let amount1Abs = amount1;

      if (amount0.lt(new GraphDecimal(0))) {
        amount0Abs = amount0.times(new GraphDecimal('-1'));
      }

      if (amount1.lt(new GraphDecimal(0))) {
        amount1Abs = amount1.times(new GraphDecimal('-1'));
      }

      const amount0ETH = amount0Abs.times(token0.derivedETH);
      const amount1ETH = amount1Abs.times(token1.derivedETH);
      const amount0USD = amount0ETH.times(bundle.ethPriceUSD);
      const amount1USD = amount1ETH.times(bundle.ethPriceUSD);

      // Get amount that should be tracked only - div 2 because cant count both input and output as volume.
      const trackedAmountUSD = await getTrackedAmountUSD(this._db, dbTx, amount0Abs, token0, amount1Abs, token1, this._isDemo);
      const amountTotalUSDTracked = trackedAmountUSD.div(new GraphDecimal('2'));
      const amountTotalETHTracked = safeDiv(amountTotalUSDTracked, bundle.ethPriceUSD);
      const amountTotalUSDUntracked = amount0USD.plus(amount1USD).div(new GraphDecimal('2'));

      const feesETH = amountTotalETHTracked.times(pool.feeTier.toString()).div(new GraphDecimal('1000000'));
      const feesUSD = amountTotalUSDTracked.times(pool.feeTier.toString()).div(new GraphDecimal('1000000'));

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
      pool.liquidity = BigInt(swapEvent.liquidity);
      pool.tick = BigInt(swapEvent.tick);
      pool.sqrtPrice = BigInt(swapEvent.sqrtPriceX96);
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

      // Update USD pricing.
      bundle.ethPriceUSD = await getEthPriceInUSD(this._db, dbTx, block, this._isDemo);
      bundle = await this._db.saveBundle(dbTx, bundle, block);
      token0.derivedETH = await findEthPerToken(this._db, dbTx, token0, this._isDemo);
      token1.derivedETH = await findEthPerToken(this._db, dbTx, token1, this._isDemo);

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
      const transaction = await loadTransaction(this._db, dbTx, { block, tx });

      const swap = new Swap();
      swap.id = transaction.id + '#' + pool.txCount.toString();
      swap.transaction = transaction;
      swap.timestamp = transaction.timestamp;
      swap.pool = pool;
      swap.token0 = pool.token0;
      swap.token1 = pool.token1;
      swap.sender = swapEvent.sender;
      swap.origin = tx.from;
      swap.recipient = swapEvent.recipient;
      swap.amount0 = amount0;
      swap.amount1 = amount1;
      swap.amountUSD = amountTotalUSDTracked;
      swap.tick = BigInt(swapEvent.tick);
      swap.sqrtPriceX96 = BigInt(swapEvent.sqrtPriceX96);

      // Skipping update pool fee growth as they are not queried.

      // Interval data.
      const uniswapDayData = await updateUniswapDayData(this._db, dbTx, { block, contractAddress });
      const poolDayData = await updatePoolDayData(this._db, dbTx, { block, contractAddress });
      const poolHourData = await updatePoolHourData(this._db, dbTx, { block, contractAddress });
      const token0DayData = await updateTokenDayData(this._db, dbTx, token0, { block });
      const token1DayData = await updateTokenDayData(this._db, dbTx, token0, { block });
      const token0HourData = await updateTokenHourData(this._db, dbTx, token0, { block });
      const token1HourData = await updateTokenHourData(this._db, dbTx, token0, { block });

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

      await this._db.saveFactory(dbTx, factory, block);

      [token0, token1] = await Promise.all([
        this._db.saveToken(dbTx, token0, block),
        this._db.saveToken(dbTx, token1, block)
      ]);

      pool.token0 = token0;
      pool.token1 = token1;
      pool = await this._db.savePool(dbTx, pool, block);

      swap.token0 = token0;
      swap.token1 = token1;
      swap.pool = pool;
      await this._db.saveSwap(dbTx, swap, block);

      token0DayData.token = token0;
      token1DayData.token = token1;
      await this._db.saveTokenDayData(dbTx, token0DayData, block);
      await this._db.saveTokenDayData(dbTx, token1DayData, block);

      await this._db.saveUniswapDayData(dbTx, uniswapDayData, block);

      poolDayData.pool = pool;
      await this._db.savePoolDayData(dbTx, poolDayData, block);

      // Update inner vars of current or crossed ticks.
      const newTick = pool.tick;
      assert(newTick);
      const tickSpacing = feeTierToTickSpacing(pool.feeTier);
      const modulo = newTick % tickSpacing;

      if (modulo === BigInt(0)) {
        // Current tick is initialized and needs to be updated.
        this._loadTickUpdateFeeVarsAndSave(dbTx, Number(newTick), block, contractAddress);
      }

      const numIters = BigInt(
        BigNumber.from(oldTick - newTick)
          .abs()
          .div(tickSpacing)
          .toString()
      );

      if (numIters > BigInt(100)) {
        // In case more than 100 ticks need to be updated ignore the update in
        // order to avoid timeouts. From testing this behavior occurs only upon
        // pool initialization. This should not be a big issue as the ticks get
        // updated later. For early users this error also disappears when calling
        // collect.
      } else if (newTick > oldTick) {
        const firstInitialized = oldTick + tickSpacing - modulo;

        for (let i = firstInitialized; i < newTick; i = i + tickSpacing) {
          this._loadTickUpdateFeeVarsAndSave(dbTx, Number(i), block, contractAddress);
        }
      } else if (newTick < oldTick) {
        const firstInitialized = oldTick - modulo;

        for (let i = firstInitialized; i >= newTick; i = i - tickSpacing) {
          this._loadTickUpdateFeeVarsAndSave(dbTx, Number(i), block, contractAddress);
        }
      }

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleIncreaseLiquidity (block: Block, contractAddress: string, tx: Transaction, event: IncreaseLiquidityEvent): Promise<void> {
    let position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));

    // position was not able to be fetched.
    if (position === null) {
      return;
    }

    // Temp fix from Subgraph mapping code.
    if (utils.getAddress(position.pool.id) === utils.getAddress('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
      return;
    }

    await this._updateFeeVars(position, block, contractAddress, BigInt(event.tokenId));
    const dbTx = await this._db.createTransactionRunner();

    try {
      if (!position.transaction) {
        const transaction = await loadTransaction(this._db, dbTx, { block, tx });
        position.transaction = transaction;
        position = await this._db.savePosition(dbTx, position, block);
      }

      const token0 = position.token0;
      const token1 = position.token1;

      const amount0 = convertTokenToDecimal(BigInt(event.amount0), BigInt(token0.decimals));
      const amount1 = convertTokenToDecimal(BigInt(event.amount1), BigInt(token1.decimals));

      position.liquidity = BigInt(position.liquidity) + BigInt(event.liquidity);
      position.depositedToken0 = position.depositedToken0.plus(amount0);
      position.depositedToken1 = position.depositedToken1.plus(amount1);

      await this._db.savePosition(dbTx, position, block);

      await this._savePositionSnapshot(dbTx, position, block, tx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
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

    position = await this._updateFeeVars(position, block, contractAddress, BigInt(event.tokenId));
    const dbTx = await this._db.createTransactionRunner();

    try {
      if (!position.transaction) {
        const transaction = await loadTransaction(this._db, dbTx, { block, tx });
        position.transaction = transaction;
        position = await this._db.savePosition(dbTx, position, block);
      }

      const token0 = position.token0;
      const token1 = position.token1;
      const amount0 = convertTokenToDecimal(BigInt(event.amount0), BigInt(token0.decimals));
      const amount1 = convertTokenToDecimal(BigInt(event.amount1), BigInt(token1.decimals));

      position.liquidity = BigInt(position.liquidity) - BigInt(event.liquidity);
      position.depositedToken0 = position.depositedToken0.plus(amount0);
      position.depositedToken1 = position.depositedToken1.plus(amount1);

      await this._db.savePosition(dbTx, position, block);

      await this._savePositionSnapshot(dbTx, position, block, tx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleCollect (block: Block, contractAddress: string, tx: Transaction, event: CollectEvent): Promise<void> {
    let position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));

    // Position was not able to be fetched.
    if (position == null) {
      return;
    }

    if (utils.getAddress(position.pool.id) === utils.getAddress('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
      return;
    }

    position = await this._updateFeeVars(position, block, contractAddress, BigInt(event.tokenId));
    const dbTx = await this._db.createTransactionRunner();

    try {
      if (!position.transaction) {
        const transaction = await loadTransaction(this._db, dbTx, { block, tx });
        position.transaction = transaction;
        position = await this._db.savePosition(dbTx, position, block);
      }

      await this._db.savePosition(dbTx, position, block);

      await this._savePositionSnapshot(dbTx, position, block, tx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleTransfer (block: Block, contractAddress: string, tx: Transaction, event: TransferEvent): Promise<void> {
    let position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));
    // Position was not able to be fetched.
    if (position === null) {
      return;
    }

    const dbTx = await this._db.createTransactionRunner();

    try {
      if (!position.transaction) {
        const transaction = await loadTransaction(this._db, dbTx, { block, tx });
        position.transaction = transaction;
        position = await this._db.savePosition(dbTx, position, block);
      }

      position.owner = event.to;
      await this._db.savePosition(dbTx, position, block);

      await this._savePositionSnapshot(dbTx, position, block, tx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _updateTickFeeVarsAndSave (dbTx: QueryRunner, tick: Tick, block: Block): Promise<void> {
    // Skipping update feeGrowthOutside0X128 and feeGrowthOutside1X128 data as they are not queried.

    await updateTickDayData(this._db, dbTx, tick, { block });
  }

  async _loadTickUpdateFeeVarsAndSave (dbTx:QueryRunner, tickId: number, block: Block, contractAddress: string): Promise<void> {
    const poolAddress = contractAddress;

    const tick = await this._db.getTick(
      dbTx,
      {
        id: poolAddress.concat('#').concat(tickId.toString()),
        blockHash: block.hash
      }
    );

    if (tick) {
      await this._updateTickFeeVarsAndSave(dbTx, tick, block);
    }
  }

  async _getPosition (block: Block, contractAddress: string, tx: Transaction, tokenId: bigint): Promise<Position | null> {
    const { hash: blockHash } = block;
    let position = await this._db.getPosition({ id: tokenId.toString(), blockHash });

    if (!position) {
      let positionResult;

      try {
        console.time('time:indexer#_getPosition-eth_call_for_positions');
        ({ value: positionResult } = await this._uniClient.positions(blockHash, contractAddress, tokenId));
        console.timeEnd('time:indexer#_getPosition-eth_call_for_positions');
      } catch (error: any) {
        // The contract call reverts in situations where the position is minted and deleted in the same block.
        // From my investigation this happens in calls from BancorSwap.
        // (e.g. 0xf7867fa19aa65298fadb8d4f72d0daed5e836f3ba01f0b9b9631cdc6c36bed40)

        if (error.message !== utils.Logger.errors.CALL_EXCEPTION) {
          log('nfpm positions eth_call failed');
          throw error;
        }
      }

      if (positionResult) {
        // TODO: In subgraph factory is fetched by hardcoded factory address.
        // Currently fetching first factory in database as only one exists.
        const [factory] = await this._db.getModelEntitiesNoTx(Factory, { hash: blockHash }, {}, { limit: 1 });

        console.time('time:indexer#_getPosition-eth_call_for_getPool');
        const { value: poolAddress } = await this._uniClient.callGetPool(blockHash, factory.id, positionResult.token0, positionResult.token1, positionResult.fee);
        console.timeEnd('time:indexer#_getPosition-eth_call_for_getPool');

        position = new Position();
        position.id = tokenId.toString();

        const pool = await this._db.getPoolNoTx({ id: poolAddress, blockHash });
        assert(pool);
        position.pool = pool;

        const [token0, token1] = await Promise.all([
          this._db.getTokenNoTx({ id: positionResult.token0, blockHash }),
          this._db.getTokenNoTx({ id: positionResult.token1, blockHash })
        ]);
        assert(token0 && token1);
        position.token0 = token0;
        position.token1 = token1;

        const [tickLower, tickUpper] = await Promise.all([
          this._db.getTickNoTx({ id: poolAddress.concat('#').concat(positionResult.tickLower.toString()), blockHash }),
          this._db.getTickNoTx({ id: poolAddress.concat('#').concat(positionResult.tickUpper.toString()), blockHash })
        ]);
        assert(tickLower && tickUpper);
        position.tickLower = tickLower;
        position.tickUpper = tickUpper;

        position.feeGrowthInside0LastX128 = BigInt(positionResult.feeGrowthInside0LastX128.toString());
        position.feeGrowthInside1LastX128 = BigInt(positionResult.feeGrowthInside1LastX128.toString());
      }
    }

    return position || null;
  }

  async _updateFeeVars (position: Position, block: Block, contractAddress: string, tokenId: bigint): Promise<Position> {
    try {
      console.time('time:indexer#_updateFeeVars-eth_call_for_positions');
      const { value: positionResult } = await this._uniClient.positions(block.hash, contractAddress, tokenId);
      console.timeEnd('time:indexer#_updateFeeVars-eth_call_for_positions');

      if (positionResult) {
        position.feeGrowthInside0LastX128 = BigInt(positionResult.feeGrowthInside0LastX128.toString());
        position.feeGrowthInside1LastX128 = BigInt(positionResult.feeGrowthInside1LastX128.toString());
      }
    } catch (error) {
      log('nfpm positions eth_call failed');
      log(error);
    }

    return position;
  }

  async _savePositionSnapshot (dbTx: QueryRunner, position: Position, block: Block, tx: Transaction): Promise<void> {
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
    positionSnapshot.transaction = await loadTransaction(this._db, dbTx, { block, tx });
    positionSnapshot.feeGrowthInside0LastX128 = position.feeGrowthInside0LastX128;
    positionSnapshot.feeGrowthInside1LastX128 = position.feeGrowthInside1LastX128;

    await this._db.savePositionSnapshot(dbTx, positionSnapshot, block);
  }
}
