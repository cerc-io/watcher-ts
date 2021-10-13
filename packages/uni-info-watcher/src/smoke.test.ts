//
// Copyright 2021 Vulcanize, Inc.
//

import { expect } from 'chai';
import { ethers, Contract, Signer, constants } from 'ethers';
import 'mocha';
import _ from 'lodash';

import {
  Config,
  getConfig,
  wait,
  OrderDirection
} from '@vulcanize/util';
import {
  deployTokens,
  deployUniswapV3Callee,
  TESTERC20_ABI,
  TICK_MIN,
  createPool,
  initializePool,
  getMinTick,
  getMaxTick,
  approveToken,
  NFPM_ABI
} from '@vulcanize/util/test';
import { Client as UniClient, watchEvent } from '@vulcanize/uni-watcher';
import {
  abi as FACTORY_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';
import {
  abi as POOL_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';

import { Client } from './client';
import {
  checkUniswapDayData,
  checkPoolDayData,
  checkTokenDayData,
  checkTokenHourData,
  fetchTransaction
} from '../test/utils';

const CONFIG_FILE = './environments/local.toml';

describe('uni-info-watcher', () => {
  let factory: Contract;
  let pool: Contract;
  let poolCallee: Contract;
  let token0: Contract;
  let token1: Contract;
  let token0Address: string;
  let token1Address: string;
  let nfpm: Contract;

  let tickLower: number;
  let tickUpper: number;
  let signer: Signer;
  let recipient: string;
  let config: Config;
  let uniClient: UniClient;
  let client: Client;

  before(async () => {
    config = await getConfig(CONFIG_FILE);

    const { upstream, server: { host, port } } = config;
    const endpoint = `http://${host}:${port}/graphql`;

    let { uniWatcher: { gqlEndpoint, gqlSubscriptionEndpoint }, ethServer: { rpcProviderEndpoint } } = upstream;
    uniClient = new UniClient({
      gqlEndpoint,
      gqlSubscriptionEndpoint
    });

    gqlEndpoint = endpoint;
    gqlSubscriptionEndpoint = endpoint;
    client = new Client({
      gqlEndpoint,
      gqlSubscriptionEndpoint
    });

    const provider = new ethers.providers.JsonRpcProvider(rpcProviderEndpoint);
    signer = provider.getSigner();
    recipient = await signer.getAddress();
  });

  it('should have a Factory entity', async () => {
    // Getting the Factory from uni-info-watcher graphQL endpoint.
    const factories = await client.getFactories(1);
    expect(factories).to.not.be.empty;

    // Initializing the factory variable.
    const factoryAddress = factories[0].id;
    factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
    expect(factory.address).to.not.be.empty;
  });

  it('should have a Bundle entity', async () => {
    // Getting the Bundle from uni-info-watcher graphQL endpoint.
    const bundles = await client.getBundles(1);
    expect(bundles).to.not.be.empty;

    const bundleId = '1';
    expect(bundles[0].id).to.equal(bundleId);
  });

  describe('PoolCreatedEvent', () => {
    // NOTE: Skipping checking entity updates that cannot be gotten/derived using queries.
    // Checked entities: Token, Pool.

    const fee = 500;

    before(async () => {
      // Deploy 2 tokens.
      ({ token0Address, token1Address } = await deployTokens(signer));
      expect(token0Address).to.not.be.empty;
      expect(token1Address).to.not.be.empty;
    });

    it('should not have Token entities', async () => {
      // Check that Token entities are absent.
      const token0 = await client.getToken(token0Address);
      expect(token0).to.be.null;

      const token1 = await client.getToken(token1Address);
      expect(token1).to.be.null;
    });

    it('should trigger PoolCreatedEvent', async () => {
      // Create Pool and wait for PoolCreatedEvent.
      const eventType = 'PoolCreatedEvent';
      await Promise.all([
        createPool(factory, token0Address, token1Address, fee),
        watchEvent(uniClient, eventType)
      ]);

      // Sleeping for 10 sec for the event to be processed.
      await wait(10000);
    });

    it('should create Token entities', async () => {
      // Check that Token entities are present.
      const token0 = await client.getToken(token0Address);
      expect(token0).to.not.be.null;

      const token1 = await client.getToken(token1Address);
      expect(token1).to.not.be.null;
    });

    it('should create a Pool entity', async () => {
      // Checked values: feeTier

      const poolWhere = {
        token0_in: [token0Address, token1Address],
        token1_in: [token0Address, token1Address]
      };
      // Getting the Pool that has the deployed tokens.
      const pools = await client.getPools(poolWhere);
      expect(pools).to.have.lengthOf(1);

      // Initializing the pool variable.
      const poolAddress = pools[0].id;
      pool = new Contract(poolAddress, POOL_ABI, signer);
      expect(pool.address).to.not.be.empty;

      expect(pools[0].feeTier).to.be.equal(fee.toString());

      // Initializing the token variables.
      token0Address = await pool.token0();
      token0 = new Contract(token0Address, TESTERC20_ABI, signer);
      token1Address = await pool.token1();
      token1 = new Contract(token1Address, TESTERC20_ABI, signer);
    });
  });

  describe('InitializeEvent', () => {
    // Checked entities: Pool, PoolDayData.
    // Unchecked entities: Bundle, Token.

    const sqrtPrice = '4295128939';
    const tick = TICK_MIN;

    it('should not have pool entity initialized', async () => {
      const poolData = await client.getPoolById(pool.address);
      expect(poolData.sqrtPrice).to.not.be.equal(sqrtPrice);
      expect(poolData.tick).to.be.null;
    });

    it('should trigger InitializeEvent', async () => {
      // Initialize Pool and wait for InitializeEvent
      const eventType = 'InitializeEvent';
      await Promise.all([
        initializePool(pool, sqrtPrice),
        watchEvent(uniClient, eventType)
      ]);

      // Sleeping for 5 sec for the event to be processed.
      await wait(5000);
    });

    it('should update Pool entity', async () => {
      // Checked values: sqrtPrice, tick.

      const poolData = await client.getPoolById(pool.address);
      expect(poolData.sqrtPrice).to.be.equal(sqrtPrice);
      expect(poolData.tick).to.be.equal(tick.toString());
    });

    it('should update PoolDayData entity', async () => {
      checkPoolDayData(client, pool.address);
    });
  });

  describe('MintEvent', () => {
    // Checked entities: Token, Factory, Pool, Transaction, Mint, Tick, UniswapDayData, PoolDayData, TokenDayData, TokenHourData.

    const amount = 10;
    const approveAmount = BigInt(1000000000000000000000000);
    let expectedTxID: string;
    let expectedTxTimestamp: string;

    // Initial entity values
    let oldFactory: any;
    let oldToken0: any;
    let oldToken1: any;
    let oldPool: any;

    before(async () => {
      // Deploy UniswapV3Callee.
      poolCallee = await deployUniswapV3Callee(signer);

      const tickSpacing = await pool.tickSpacing();
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
      tickLower = getMinTick(tickSpacing);
      tickUpper = getMaxTick(tickSpacing);

      await approveToken(token0, poolCallee.address, approveAmount);
      await approveToken(token1, poolCallee.address, approveAmount);

      // Get initial entity values.
      const factories = await client.getFactories(1);
      oldFactory = factories[0];

      oldToken0 = await client.getToken(token0.address);

      oldToken1 = await client.getToken(token1.address);

      oldPool = await client.getPoolById(pool.address);
    });

    it('should trigger MintEvent', async () => {
      // Pool mint and wait for MintEvent.
      const eventType = 'MintEvent';
      await Promise.all([
        poolCallee.mint(pool.address, recipient, BigInt(tickLower), BigInt(tickUpper), BigInt(amount)),
        watchEvent(uniClient, eventType)
      ]);

      // Sleeping for 20 sec for the event to be processed.
      await wait(20000);
    });

    it('should update Token entities', async () => {
      // Checked values: txCount.
      // Unchecked values: totalValueLocked, totalValueLockedUSD.

      const newToken0 = await client.getToken(token0.address);

      const newToken1 = await client.getToken(token1.address);

      expect(newToken0.txCount).to.be.equal((BigInt(oldToken0.txCount) + BigInt(1)).toString());
      expect(newToken1.txCount).to.be.equal((BigInt(oldToken1.txCount) + BigInt(1)).toString());
    });

    it('should update Factory entity', async () => {
      // Checked values: txCount.
      // Unchecked values: totalValueLockedUSD.

      const factories = await client.getFactories(1);
      const newFactory = factories[0];
      expect(newFactory.txCount).to.be.equal((BigInt(oldFactory.txCount) + BigInt(1)).toString());
    });

    it('should update Pool entity', async () => {
      // Checked values: txCount, liquidity.
      // Unchecked values: totalValueLockedToken0, totalValueLockedToken1, totalValueLockedUSD.

      let expectedLiquidity = BigInt(oldPool.liquidity);
      if (oldPool.tick !== null) {
        if (
          BigInt(tickLower) <= BigInt(oldPool.tick) &&
          BigInt(tickUpper) > BigInt(oldPool.tick)
        ) {
          expectedLiquidity = BigInt(oldPool.liquidity) + BigInt(amount);
        }
      }

      const newPool = await client.getPoolById(pool.address);

      expect(newPool.txCount).to.be.equal((BigInt(oldPool.txCount) + BigInt(1)).toString());
      expect(BigInt(newPool.liquidity)).to.be.equal(expectedLiquidity);
    });

    it('should create a Transaction entity', async () => {
      // Checked values: mints, burns, swaps.

      const transaction: any = await fetchTransaction(client);

      expectedTxID = transaction.id;
      expectedTxTimestamp = transaction.timestamp;

      expect(transaction.mints).to.not.be.empty;
      expect(transaction.burns).to.be.empty;
      expect(transaction.swaps).to.be.empty;

      const timestamp = transaction.mints[0].timestamp;
      expect(timestamp).to.be.equal(expectedTxTimestamp);
    });

    it('should create a Mint entity', async () => {
      // Checked values: id, origin, owner, sender, timestamp, pool, transaction.
      // Unchecked values: amount0, amount1, amountUSD.

      // Get the latest Mint.
      const mints = await client.getMints({ pool: pool.address }, 1, 'timestamp', OrderDirection.desc);
      expect(mints).to.not.be.empty;

      const mint = mints[0];
      const txID = mint.id.split('#')[0];
      const txCountID = mint.id.split('#')[1];

      const poolData = await client.getPoolById(pool.address);
      const poolTxCount = poolData.txCount;
      const expectedOrigin = recipient;
      const expectedOwner = recipient;
      const expectedSender = poolCallee.address;

      expect(txID).to.be.equal(expectedTxID);
      expect(txCountID).to.be.equal(poolTxCount);
      expect(mint.origin).to.be.equal(expectedOrigin);
      expect(mint.owner).to.be.equal(expectedOwner);
      expect(mint.sender).to.be.equal(expectedSender);
      expect(mint.timestamp).to.be.equal(expectedTxTimestamp);

      expect(mint.pool.id).to.be.equal(pool.address);
      expect(mint.transaction.id).to.be.equal(expectedTxID);
    });

    it('should create Tick entities', async () => {
      // Checked values: liquidityGross, liquidityNet.
      // Unchecked values: id, price0, price1.

      const ticks = await client.getTicks({ poolAddress: pool.address });
      expect(ticks).to.not.be.empty;

      const lowerTick: any = _.filter(ticks, { tickIdx: tickLower.toString() })[0];
      const upperTick: any = _.filter(ticks, { tickIdx: tickUpper.toString() })[0];

      expect(lowerTick.liquidityGross).to.be.equal(amount.toString());
      expect(lowerTick.liquidityNet).to.be.equal(amount.toString());
      expect(upperTick.liquidityGross).to.be.equal(amount.toString());
      expect(upperTick.liquidityNet).to.be.equal(amount.toString());
    });

    it('should update UniswapDayData entity', async () => {
      checkUniswapDayData(client);
    });

    it('should update PoolDayData entity', async () => {
      checkPoolDayData(client, pool.address);
    });

    it('should update TokenDayData entities', async () => {
      checkTokenDayData(client, token0.address);
      checkTokenDayData(client, token1.address);
    });

    it('should update TokenHourData entities', async () => {
      checkTokenHourData(client, token0.address);
      checkTokenHourData(client, token1.address);
    });
  });

  describe('BurnEvent', () => {
    // Checked entities: Token, Factory, Pool, Transaction, Burn, Tick, UniswapDayData, PoolDayData, TokenDayData, TokenHourData.

    const amount = 10;
    let expectedTxID: string;
    let expectedTxTimestamp: string;

    // Initial entity values
    let oldFactory: any;
    let oldToken0: any;
    let oldToken1: any;
    let oldPool: any;
    let oldLowerTick: any;
    let oldUpperTick: any;

    before(async () => {
      // Get initial entity values.
      const factories = await await client.getFactories(1);
      oldFactory = factories[0];

      oldToken0 = await client.getToken(token0.address);

      oldToken1 = await client.getToken(token1.address);

      oldPool = await client.getPoolById(pool.address);

      const ticks = await client.getTicks({ poolAddress: pool.address });
      expect(ticks).to.not.be.empty;

      oldLowerTick = _.filter(ticks, { tickIdx: tickLower.toString() })[0];
      oldUpperTick = _.filter(ticks, { tickIdx: tickUpper.toString() })[0];
    });

    it('should trigger BurnEvent', async () => {
      // Pool burn and wait for BurnEvent.
      const eventType = 'BurnEvent';
      await Promise.all([
        pool.burn(BigInt(tickLower), BigInt(tickUpper), BigInt(amount)),
        watchEvent(uniClient, eventType)
      ]);

      // Sleeping for 15 sec for the event to be processed.
      await wait(15000);
    });

    it('should update Token entities', async () => {
      // Checked values: txCount.
      // Unchecked values: totalValueLocked, totalValueLockedUSD.

      const newToken0 = await client.getToken(token0.address);

      const newToken1 = await client.getToken(token1.address);

      expect(newToken0.txCount).to.be.equal((BigInt(oldToken0.txCount) + BigInt(1)).toString());
      expect(newToken1.txCount).to.be.equal((BigInt(oldToken1.txCount) + BigInt(1)).toString());
    });

    it('should update Factory entity', async () => {
      // Checked values: txCount.
      // Unchecked values: totalValueLockedUSD.

      const factories = await client.getFactories(1);
      const newFactory = factories[0];
      expect(newFactory.txCount).to.be.equal((BigInt(oldFactory.txCount) + BigInt(1)).toString());
    });

    it('should update Pool entity', async () => {
      // Checked values: txCount, liquidity.
      // Unchecked values: totalValueLockedToken0, totalValueLockedToken1, totalValueLockedUSD.

      let expectedLiquidity = BigInt(oldPool.liquidity);
      if (oldPool.tick !== null) {
        if (
          BigInt(tickLower) <= BigInt(oldPool.tick) &&
          BigInt(tickUpper) > BigInt(oldPool.tick)
        ) {
          expectedLiquidity = BigInt(oldPool.liquidity) - BigInt(amount);
        }
      }

      const newPool = await client.getPoolById(pool.address);

      expect(newPool.txCount).to.be.equal((BigInt(oldPool.txCount) + BigInt(1)).toString());
      expect(BigInt(newPool.liquidity)).to.be.equal(expectedLiquidity);
    });

    it('should create a Transaction entity', async () => {
      // Checked values: mints, burns, swaps.

      const transaction: any = await fetchTransaction(client);

      expectedTxID = transaction.id;
      expectedTxTimestamp = transaction.timestamp;

      expect(transaction.mints).to.be.empty;
      expect(transaction.burns).to.not.be.empty;
      expect(transaction.swaps).to.be.empty;

      const timestamp = transaction.burns[0].timestamp;
      expect(timestamp).to.be.equal(expectedTxTimestamp);
    });

    it('should create a Burn entity', async () => {
      // Checked values: id, origin, owner, timestamp, pool, transaction.
      // Unchecked values: amount0, amount1, amountUSD.

      // Get the latest Burn.
      const burns = await client.getBurns({ pool: pool.address }, 1, 'timestamp', OrderDirection.desc);
      expect(burns).to.not.be.empty;

      const burn = burns[0];
      const txID = burn.id.split('#')[0];
      const txCountID = burn.id.split('#')[1];

      const poolData = await client.getPoolById(pool.address);
      const poolTxCount = poolData.txCount;
      const expectedOrigin = recipient;
      const expectedOwner = recipient;

      expect(txID).to.be.equal(expectedTxID);
      expect(txCountID).to.be.equal(poolTxCount);
      expect(burn.origin).to.be.equal(expectedOrigin);
      expect(burn.owner).to.be.equal(expectedOwner);
      expect(burn.timestamp).to.be.equal(expectedTxTimestamp);

      expect(burn.pool.id).to.be.equal(pool.address);
      expect(burn.transaction.id).to.be.equal(expectedTxID);
    });

    it('should update Tick entities', async () => {
      // Checked values: liquidityGross, liquidityNet.
      // Unchecked values: id, price0, price1.

      const ticks = await client.getTicks({ poolAddress: pool.address });
      expect(ticks).to.not.be.empty;

      const newLowerTick: any = _.filter(ticks, { tickIdx: tickLower.toString() })[0];
      const newUpperTick: any = _.filter(ticks, { tickIdx: tickUpper.toString() })[0];

      const expectedLLG = BigInt(oldLowerTick.liquidityGross) - BigInt(amount);
      const expectedLN = BigInt(oldLowerTick.liquidityNet) - BigInt(amount);
      const expectedULG = BigInt(oldUpperTick.liquidityGross) - BigInt(amount);
      const expectedUN = BigInt(oldUpperTick.liquidityNet) + BigInt(amount);

      expect(newLowerTick.liquidityGross).to.be.equal(expectedLLG.toString());
      expect(newLowerTick.liquidityNet).to.be.equal(expectedLN.toString());
      expect(newUpperTick.liquidityGross).to.be.equal(expectedULG.toString());
      expect(newUpperTick.liquidityNet).to.be.equal(expectedUN.toString());
    });

    it('should update UniswapDayData entity', async () => {
      checkUniswapDayData(client);
    });

    it('should update PoolDayData entity', async () => {
      checkPoolDayData(client, pool.address);
    });

    it('should update TokenDayData entities', async () => {
      checkTokenDayData(client, token0.address);
      checkTokenDayData(client, token1.address);
    });

    it('should update TokenHourData entities', async () => {
      checkTokenHourData(client, token0.address);
      checkTokenHourData(client, token1.address);
    });
  });

  describe('SwapEvent', () => {
    // Checked entities: Token, Factory, Pool, Transaction, Swap, Tick, UniswapDayData, PoolDayData, TokenDayData, TokenHourData.
    // Unchecked entities: Bundle.

    const sqrtPrice = '4295128938';
    let expectedTxID: string;
    let expectedTxTimestamp: string;

    // Initial entity values
    let eventValue: any;
    let oldFactory: any;
    let oldToken0: any;
    let oldToken1: any;
    let oldPool: any;

    before(async () => {
      // Get initial entity values.
      const factories = await client.getFactories(1);
      oldFactory = factories[0];

      oldToken0 = await client.getToken(token0.address);

      oldToken1 = await client.getToken(token1.address);

      oldPool = await client.getPoolById(pool.address);
    });

    it('should trigger SwapEvent', async () => {
      // Pool swap and wait for SwapEvent.
      const eventType = 'SwapEvent';
      const values = await Promise.all([
        poolCallee.swapToLowerSqrtPrice(pool.address, BigInt(sqrtPrice), recipient),
        watchEvent(uniClient, eventType)
      ]);
      eventValue = values[1];

      // Sleeping for 5 sec for the event to be processed.
      await wait(5000);
    });

    it('should update Token entities', async () => {
      // Checked values: txCount.
      // Unchecked values: derivedETH, feesUSD, totalValueLocked, totalValueLockedUSD, volume, volumeUSD.

      const newToken0 = await client.getToken(token0.address);

      const newToken1 = await client.getToken(token1.address);

      expect(newToken0.txCount).to.be.equal((BigInt(oldToken0.txCount) + BigInt(1)).toString());
      expect(newToken1.txCount).to.be.equal((BigInt(oldToken1.txCount) + BigInt(1)).toString());
    });

    it('should update Factory entity', async () => {
      // Checked values: txCount.
      // Unchecked values: totalFeesUSD, totalValueLockedUSD, totalVolumeUSD.

      const factories = await client.getFactories(1);
      const newFactory = factories[0];
      expect(newFactory.txCount).to.be.equal((BigInt(oldFactory.txCount) + BigInt(1)).toString());
    });

    it('should update Pool entity', async () => {
      // Checked values: txCount, liquidity, tick, sqrtPrice.
      // Unchecked values: token0Price, token1Price, totalValueLockedToken0, totalValueLockedToken1, totalValueLockedUSD, volumeUSD.

      const expectedLiquidity = eventValue.event.liquidity;
      const expectedTick = eventValue.event.tick;
      const expectedSqrtPrice = eventValue.event.sqrtPriceX96;

      const newPool = await client.getPoolById(pool.address);

      expect(newPool.txCount).to.be.equal((BigInt(oldPool.txCount) + BigInt(1)).toString());
      expect(newPool.liquidity).to.be.equal(expectedLiquidity);
      expect(newPool.tick).to.be.equal(expectedTick);
      expect(newPool.sqrtPrice).to.be.equal(expectedSqrtPrice);
    });

    it('should create a Transaction entity', async () => {
      // Checked values: mints, burns, swaps.

      const transaction: any = await fetchTransaction(client);

      expectedTxID = transaction.id;
      expectedTxTimestamp = transaction.timestamp;

      expect(transaction.mints).to.be.empty;
      expect(transaction.burns).to.be.empty;
      expect(transaction.swaps).to.not.be.empty;

      const timestamp = transaction.swaps[0].timestamp;
      expect(timestamp).to.be.equal(expectedTxTimestamp);
    });

    it('should create a Swap entity', async () => {
      // Checked values: id, origin, timestamp, pool, transaction.
      // Unchecked values: amount0, amount1, amountUSD.

      const swaps = await client.getSwaps({ pool: pool.address }, 1, 'timestamp', OrderDirection.desc);
      expect(swaps).to.not.be.empty;

      const swap = swaps[0];
      const txID = swap.id.split('#')[0];
      const txCountID = swap.id.split('#')[1];

      const poolData = await client.getPoolById(pool.address);
      const poolTxCount = poolData.txCount;
      const expectedOrigin = recipient;

      expect(txID).to.be.equal(expectedTxID);
      expect(txCountID).to.be.equal(poolTxCount);
      expect(swap.origin).to.be.equal(expectedOrigin);
      expect(swap.timestamp).to.be.equal(expectedTxTimestamp);

      expect(swap.pool.id).to.be.equal(pool.address);
      expect(swap.transaction.id).to.be.equal(expectedTxID);
    });

    it('should update UniswapDayData entity', async () => {
      checkUniswapDayData(client);
    });

    it('should update PoolDayData entity', async () => {
      checkPoolDayData(client, pool.address);
    });

    it('should update TokenDayData entities', async () => {
      checkTokenDayData(client, token0.address);
      checkTokenDayData(client, token1.address);
    });

    it('should update TokenHourData entities', async () => {
      checkTokenHourData(client, token0.address);
      checkTokenHourData(client, token1.address);
    });
  });

  describe('TransferEvent', () => {
    // NOTE: The test cases for TransferEvent are written such that IncreaseLiquidityEvent has also been processed right after.
    // Checked entities: Transaction, Position.

    const fee = 3000;
    const sqrtPrice = '79228162514264337593543950336';
    let eventType: string;
    let eventValue: any;
    let expectedTxID: string;

    const amount0Desired = 15;
    const amount1Desired = 15;
    const amount0Min = 0;
    const amount1Min = 0;
    const deadline = 1634367993;

    before(async () => {
      // Get the NFPM contract address.
      const nfpmContract = await uniClient.getContract('nfpm');
      expect(nfpmContract).to.not.be.empty;

      // Initialize the NFPM contract.
      nfpm = new Contract(nfpmContract.address, NFPM_ABI, signer);

      // Create Pool.
      createPool(factory, token0Address, token1Address, fee);

      // Wait for PoolCreatedEvent.
      eventType = 'PoolCreatedEvent';
      eventValue = await watchEvent(uniClient, eventType);

      // Sleeping for 10 sec for the event to be processed.
      await wait(10000);

      // Reinitializing the pool variable.
      const poolAddress = eventValue.event.pool;
      pool = new Contract(poolAddress, POOL_ABI, signer);
      expect(pool.address).to.not.be.empty;

      // Reinitializing the ticks
      const tickSpacing = await pool.tickSpacing();
      tickLower = getMinTick(tickSpacing);
      tickUpper = getMaxTick(tickSpacing);

      // Initialize Pool.
      initializePool(pool, sqrtPrice);

      // Wait for InitializeEvent.
      eventType = 'InitializeEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 5 sec for the event to be processed.
      await wait(5000);

      // Approving tokens for NonfungiblePositionManager contract.
      await approveToken(token0, nfpm.address, BigInt(constants.MaxUint256.toString()));
      await approveToken(token1, nfpm.address, BigInt(constants.MaxUint256.toString()));
    });

    it('should trigger TransferEvent', async () => {
      // NFPM mint and wait for MintEvent.
      const transaction = nfpm.mint({
        token0: token0Address,
        token1: token1Address,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        recipient,
        deadline,
        fee
      });

      eventType = 'MintEvent';
      await Promise.all([
        transaction,
        watchEvent(uniClient, eventType)
      ]);

      // Wait for TransferEvent.
      eventType = 'TransferEvent';
      eventValue = await watchEvent(uniClient, eventType);

      // Wait for IncreaseLiquidityEvent.
      eventType = 'IncreaseLiquidityEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 15 sec for the events to be processed.
      await wait(15000);
    });

    it('should create a Transaction entity', async () => {
      // Checked values: mints, burns, swaps.

      const transaction: any = await fetchTransaction(client);

      expectedTxID = transaction.id;
      const expectedTxTimestamp = transaction.timestamp;

      expect(transaction.mints).to.not.be.empty;
      expect(transaction.burns).to.be.empty;
      expect(transaction.swaps).to.be.empty;

      const timestamp = transaction.mints[0].timestamp;
      expect(timestamp).to.be.equal(expectedTxTimestamp);
    });

    it('should create a Position entity', async () => {
      // Checked values: pool, token0, token1, tickLower, tickUpper, transaction, owner.
      // Unchecked values: feeGrowthInside0LastX128, feeGrowthInside0LastX128.

      // Get the Position using tokenId.
      const positions = await client.getPositions({ id: Number(eventValue.event.tokenId) }, 1);
      expect(positions).to.not.be.empty;

      const position = positions[0];
      const positionTickLower = position.tickLower.id.split('#')[1];
      const positionTickUpper = position.tickUpper.id.split('#')[1];

      const expectedOwner = eventValue.event.to;

      expect(position.pool.id).to.be.equal(pool.address);
      expect(position.token0.id).to.be.equal(token0.address);
      expect(position.token1.id).to.be.equal(token1.address);
      expect(positionTickLower).to.be.equal(tickLower.toString());
      expect(positionTickUpper).to.be.equal(tickUpper.toString());
      expect(position.transaction.id).to.be.equal(expectedTxID);
      expect(position.owner).to.be.equal(expectedOwner);
    });
  });

  describe('IncreaseLiquidityEvent', () => {
    // Checked entities: Transaction, Position.

    let oldPosition: any;
    let eventValue: any;
    let eventType: string;

    const tokenId = 1;
    const amount0Desired = 15;
    const amount1Desired = 15;
    const amount0Min = 0;
    const amount1Min = 0;
    const deadline = 1634367993;

    before(async () => {
      // Get initial entity values.
      const positions = await client.getPositions({ id: Number(tokenId) }, 1);
      oldPosition = positions[0];
    });

    it('should trigger IncreaseLiquidityEvent', async () => {
      // Position manger increase liquidity and wait for MintEvent.
      const transaction = nfpm.increaseLiquidity({
        tokenId,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        deadline
      });

      eventType = 'MintEvent';
      await Promise.all([
        transaction,
        watchEvent(uniClient, eventType)
      ]);

      // Wait for IncreaseLiquidityEvent.
      eventType = 'IncreaseLiquidityEvent';
      eventValue = await watchEvent(uniClient, eventType);

      // Sleeping for 10 sec for the events to be processed.
      await wait(10000);
    });

    it('should create a Transaction entity', async () => {
      // Checked values: mints, burns, swaps.

      const transaction: any = await fetchTransaction(client);

      const expectedTxTimestamp = transaction.timestamp;

      expect(transaction.mints).to.not.be.empty;
      expect(transaction.burns).to.be.empty;
      expect(transaction.swaps).to.be.empty;

      const timestamp = transaction.mints[0].timestamp;
      expect(timestamp).to.be.equal(expectedTxTimestamp);
    });

    it('should update Position entity', async () => {
      // Checked values: liquidity.
      // Unchecked values: depositedToken0, depositedToken1, feeGrowthInside0LastX128, feeGrowthInside0LastX128.

      // Get the Position using tokenId.
      const positions = await client.getPositions({ id: Number(eventValue.event.tokenId) }, 1);
      expect(positions).to.not.be.empty;

      const position = positions[0];

      const expectedLiquidity = BigInt(oldPosition.liquidity) + BigInt(eventValue.event.liquidity);

      expect(position.liquidity).to.be.equal(expectedLiquidity.toString());
    });
  });

  describe('DecreaseLiquidityEvent', () => {
    // Checked entities: Transaction, Position.

    let oldPosition: any;
    let eventValue: any;
    let eventType: string;

    const tokenId = 1;
    const liquidity = 5;
    const amount0Min = 0;
    const amount1Min = 0;
    const deadline = 1634367993;

    before(async () => {
      // Get initial entity values.
      const positions = await client.getPositions({ id: Number(tokenId) }, 1);
      oldPosition = positions[0];
    });

    it('should trigger DecreaseLiquidityEvent', async () => {
      // Position manger decrease liquidity and wait for BurnEvent.
      const transaction = nfpm.decreaseLiquidity({
        tokenId,
        liquidity,
        amount0Min,
        amount1Min,
        deadline
      });

      eventType = 'BurnEvent';
      await Promise.all([
        transaction,
        watchEvent(uniClient, eventType)
      ]);

      // Wait for DecreaseLiquidityEvent.
      eventType = 'DecreaseLiquidityEvent';
      eventValue = await watchEvent(uniClient, eventType);

      // Sleeping for 10 sec for the events to be processed.
      await wait(10000);
    });

    it('should create a Transaction entity', async () => {
      // Checked values: mints, burns, swaps.

      const transaction: any = await fetchTransaction(client);

      const expectedTxTimestamp = transaction.timestamp;

      expect(transaction.mints).to.be.empty;
      expect(transaction.burns).to.not.be.empty;
      expect(transaction.swaps).to.be.empty;

      const timestamp = transaction.burns[0].timestamp;
      expect(timestamp).to.be.equal(expectedTxTimestamp);
    });

    it('should update Position entity', async () => {
      // Checked values: liquidity.
      // Unchecked values: depositedToken0, depositedToken1, feeGrowthInside0LastX128, feeGrowthInside0LastX128.

      // Get the Position using tokenId.
      const positions = await client.getPositions({ id: Number(eventValue.event.tokenId) }, 1);
      expect(positions).to.not.be.empty;

      const position = positions[0];

      const expectedLiquidity = BigInt(oldPosition.liquidity) - BigInt(eventValue.event.liquidity);

      expect(position.liquidity).to.be.equal(expectedLiquidity.toString());
    });
  });

  describe('CollectEvent', () => {
    // Checked entities: Transaction.
    // Unchecked entities: Position.

    let eventType: string;

    const tokenId = 1;
    const amount0Max = 15;
    const amount1Max = 15;

    it('should trigger CollectEvent', async () => {
      // Position manger collect and wait for BurnEvent.
      const transaction = nfpm.collect({
        tokenId,
        recipient,
        amount0Max,
        amount1Max
      });

      eventType = 'BurnEvent';
      await Promise.all([
        transaction,
        watchEvent(uniClient, eventType)
      ]);

      // Wait for CollectEvent.
      eventType = 'CollectEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 10 sec for the events to be processed.
      await wait(10000);
    });

    it('should create a Transaction entity', async () => {
      // Checked values: mints, burns, swaps.

      const transaction: any = await fetchTransaction(client);

      const expectedTxTimestamp = transaction.timestamp;

      expect(transaction.mints).to.be.empty;
      expect(transaction.burns).to.not.be.empty;
      expect(transaction.swaps).to.be.empty;

      const timestamp = transaction.burns[0].timestamp;
      expect(timestamp).to.be.equal(expectedTxTimestamp);
    });
  });
});
