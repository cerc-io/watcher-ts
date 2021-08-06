import { expect } from 'chai';
import { ethers, Contract, Signer } from 'ethers';
import { request } from 'graphql-request';
import 'mocha';
import _ from 'lodash';

import {
  Config,
  getConfig,
  wait,
  deployTokens,
  deployUniswapV3Callee,
  TESTERC20_ABI,
  TICK_MIN,
  createPool,
  initializePool,
  getMinTick,
  getMaxTick,
  approveToken
} from '@vulcanize/util';
import { Client as UniClient, watchEvent } from '@vulcanize/uni-watcher';
import {
  abi as FACTORY_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';
import {
  abi as POOL_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';

import {
  queryFactory,
  queryBundle,
  queryToken,
  queryPoolsByTokens,
  queryPoolById,
  queryMints,
  queryTicks,
  queryBurns,
  querySwaps
} from '../test/queries';
import {
  checkUniswapDayData,
  checkPoolDayData,
  checkTokenDayData,
  checkTokenHourData
} from '../test/utils';

const NETWORK_RPC_URL = 'http://localhost:8545';

describe('uni-info-watcher', () => {
  let factory: Contract;
  let pool: Contract;
  let poolCallee: Contract;
  let token0: Contract;
  let token1: Contract;
  let token0Address: string;
  let token1Address: string;

  let tickLower: number;
  let tickUpper: number;
  let signer: Signer;
  let recipient: string;
  let config: Config;
  let endpoint: string;
  let uniClient: UniClient;

  before(async () => {
    const provider = new ethers.providers.JsonRpcProvider(NETWORK_RPC_URL);
    signer = provider.getSigner();
    recipient = await signer.getAddress();

    const configFile = './environments/local.toml';
    config = await getConfig(configFile);

    const { upstream, server: { host, port } } = config;
    endpoint = `http://${host}:${port}/graphql`;

    const { uniWatcher: { gqlEndpoint, gqlSubscriptionEndpoint } } = upstream;
    uniClient = new UniClient({
      gqlEndpoint,
      gqlSubscriptionEndpoint
    });
  });

  it('should have a Factory entity', async () => {
    // Getting the Factory from uni-info-watcher graphQL endpoint.
    const data = await request(endpoint, queryFactory);
    expect(data.factories).to.not.be.empty;

    // Initializing the factory variable.
    const factoryAddress = data.factories[0].id;
    factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
    expect(factory.address).to.not.be.empty;
  });

  it('should have a Bundle entity', async () => {
    // Getting the Bundle from uni-info-watcher graphQL endpoint.
    const data = await request(endpoint, queryBundle);
    expect(data.bundles).to.not.be.empty;

    const bundleId = '1';
    expect(data.bundles[0].id).to.equal(bundleId);
  });

  describe('PoolCreatedEvent', () => {
    // NOTE Skipping checking entity updates that cannot be gotten/derived using queries.

    const fee = 500;

    before(async () => {
      // Deploy 2 tokens.
      ({ token0Address, token1Address } = await deployTokens(signer));
      expect(token0Address).to.not.be.empty;
      expect(token1Address).to.not.be.empty;
    });

    it('should not have Token entities', async () => {
      // Check that Token entities are absent.
      const data0 = await request(endpoint, queryToken, { id: token0Address });
      expect(data0.token).to.be.null;

      const data1 = await request(endpoint, queryToken, { id: token0Address });
      expect(data1.token).to.be.null;
    });

    it('should trigger PoolCreatedEvent', async () => {
      // Create Pool.
      // Not doing tx.wait() here as we are waiting for the event.
      createPool(factory, token0Address, token1Address, fee);

      // Wait for PoolCreatedEvent.
      const eventType = 'PoolCreatedEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 10 sec for the entities to be processed.
      await wait(10000);
    });

    it('should create Token entities', async () => {
      // Check that Token entities are present.
      const data0 = await request(endpoint, queryToken, { id: token0Address });
      expect(data0.token).to.not.be.null;

      const data1 = await request(endpoint, queryToken, { id: token0Address });
      expect(data1.token).to.not.be.null;
    });

    it('should create a Pool entity', async () => {
      const variables = {
        tokens: [token0Address, token1Address]
      };
      // Getting the Pool that has the deployed tokens.
      const data = await request(endpoint, queryPoolsByTokens, variables);
      expect(data.pools).to.have.lengthOf(1);

      // Initializing the pool variable.
      const poolAddress = data.pools[0].id;
      pool = new Contract(poolAddress, POOL_ABI, signer);
      expect(pool.address).to.not.be.empty;

      expect(data.pools[0].feeTier).to.be.equal(fee.toString());

      // Initializing the token variables.
      token0Address = await pool.token0();
      token0 = new Contract(token0Address, TESTERC20_ABI, signer);
      token1Address = await pool.token1();
      token1 = new Contract(token1Address, TESTERC20_ABI, signer);
    });
  });

  describe('InitializeEvent', () => {
    const sqrtPrice = '4295128939';
    const tick = TICK_MIN;

    it('should not have pool entity initialized', async () => {
      const data = await request(endpoint, queryPoolById, { id: pool.address });
      expect(data.pool.sqrtPrice).to.not.be.equal(sqrtPrice);
      expect(data.pool.tick).to.be.null;
    });

    it('should trigger InitializeEvent', async () => {
      initializePool(pool, sqrtPrice);

      // Wait for InitializeEvent.
      const eventType = 'InitializeEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 5 sec for the entities to be processed.
      await wait(5000);

      const data = await request(endpoint, queryPoolById, { id: pool.address });
      expect(data.pool.sqrtPrice).to.be.equal(sqrtPrice);
      expect(data.pool.tick).to.be.equal(tick.toString());
    });

    it('should update PoolDayData entity', async () => {
      checkPoolDayData(endpoint, pool.address);
    });
  });

  describe('MintEvent', () => {
    const amount = 10;
    const approveAmount = BigInt(1000000000000000000000000);

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
      let data: any;

      data = await request(endpoint, queryFactory);
      oldFactory = data.factories[0];

      data = await request(endpoint, queryToken, { id: token0.address });
      oldToken0 = data.token;

      data = await request(endpoint, queryToken, { id: token1.address });
      oldToken1 = data.token;

      data = await request(endpoint, queryPoolById, { id: pool.address });
      oldPool = data.pool;
    });

    it('should trigger MintEvent', async () => {
      // Pool mint.
      poolCallee.mint(pool.address, recipient, BigInt(tickLower), BigInt(tickUpper), BigInt(amount));

      // Wait for MintEvent.
      const eventType = 'MintEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 20 sec for the entities to be processed.
      await wait(20000);
    });

    it('should update Token entities', async () => {
      // Check txCount.
      let data: any;

      data = await request(endpoint, queryToken, { id: token0.address });
      const newToken0 = data.token;

      data = await request(endpoint, queryToken, { id: token1.address });
      const newToken1 = data.token;

      expect(newToken0.txCount).to.be.equal((BigInt(oldToken0.txCount) + BigInt(1)).toString());
      expect(newToken1.txCount).to.be.equal((BigInt(oldToken1.txCount) + BigInt(1)).toString());
    });

    it('should update Factory entity', async () => {
      // Check txCount.
      const data = await request(endpoint, queryFactory);
      const newFactory = data.factories[0];
      expect(newFactory.txCount).to.be.equal((BigInt(oldFactory.txCount) + BigInt(1)).toString());
    });

    it('should update Pool entity', async () => {
      // Check txCount, liquidity.
      let expectedLiquidity = BigInt(oldPool.liquidity);
      if (oldPool.tick !== null) {
        if (
          BigInt(tickLower) <= BigInt(oldPool.tick) &&
          BigInt(tickUpper) > BigInt(oldPool.tick)
        ) {
          expectedLiquidity = BigInt(oldPool.liquidity) + BigInt(amount);
        }
      }

      const data = await request(endpoint, queryPoolById, { id: pool.address });
      const newPool = data.pool;

      expect(newPool.txCount).to.be.equal((BigInt(oldPool.txCount) + BigInt(1)).toString());
      expect(BigInt(newPool.liquidity)).to.be.equal(expectedLiquidity);
    });

    it('should create a Mint entity', async () => {
      // Check id, origin, owner, sender.
      // Get the latest Mint.
      let data: any;
      const variables = {
        first: 1,
        orderBy: 'timestamp',
        orderDirection: 'desc',
        pool: pool.address
      };
      data = await request(endpoint, queryMints, variables);
      expect(data.mints).to.not.be.empty;

      const id: string = data.mints[0].id;
      const txCountID = id.split('#')[1];
      const origin = data.mints[0].origin;
      const owner = data.mints[0].owner;
      const sender = data.mints[0].sender;

      data = await request(endpoint, queryPoolById, { id: pool.address });
      const poolTxCount = data.pool.txCount;
      const expectedOrigin = recipient;
      const expectedOwner = recipient;
      const expectedSender = poolCallee.address;

      expect(txCountID).to.be.equal(poolTxCount);
      expect(origin).to.be.equal(expectedOrigin);
      expect(owner).to.be.equal(expectedOwner);
      expect(sender).to.be.equal(expectedSender);
    });

    it('should create Tick entities', async () => {
      // Check liquidityGross, liquidityNet.
      const data = await request(endpoint, queryTicks, { pool: pool.address });
      expect(data.ticks).to.not.be.empty;

      const lowerTick: any = _.filter(data.ticks, { tickIdx: tickLower.toString() })[0];
      const upperTick: any = _.filter(data.ticks, { tickIdx: tickUpper.toString() })[0];

      expect(lowerTick.liquidityGross).to.be.equal(amount.toString());
      expect(lowerTick.liquidityNet).to.be.equal(amount.toString());
      expect(upperTick.liquidityGross).to.be.equal(amount.toString());
      expect(upperTick.liquidityNet).to.be.equal(amount.toString());
    });

    it('should update UniswapDayData entity', async () => {
      checkUniswapDayData(endpoint);
    });

    it('should update PoolDayData entity', async () => {
      checkPoolDayData(endpoint, pool.address);
    });

    it('should update TokenDayData entities', async () => {
      checkTokenDayData(endpoint, token0.address);
      checkTokenDayData(endpoint, token1.address);
    });

    it('should update TokenHourData entities', async () => {
      checkTokenHourData(endpoint, token0.address);
      checkTokenHourData(endpoint, token1.address);
    });
  });

  describe('BurnEvent', () => {
    const amount = 10;

    // Initial entity values
    let oldFactory: any;
    let oldToken0: any;
    let oldToken1: any;
    let oldPool: any;
    let oldLowerTick: any;
    let oldUpperTick: any;

    before(async () => {
      // Get initial entity values.
      let data: any;

      data = await request(endpoint, queryFactory);
      oldFactory = data.factories[0];

      data = await request(endpoint, queryToken, { id: token0.address });
      oldToken0 = data.token;

      data = await request(endpoint, queryToken, { id: token1.address });
      oldToken1 = data.token;

      data = await request(endpoint, queryPoolById, { id: pool.address });
      oldPool = data.pool;

      data = await request(endpoint, queryTicks, { pool: pool.address });
      expect(data.ticks).to.not.be.empty;

      oldLowerTick = _.filter(data.ticks, { tickIdx: tickLower.toString() })[0];
      oldUpperTick = _.filter(data.ticks, { tickIdx: tickUpper.toString() })[0];
    });

    it('should trigger BurnEvent', async () => {
      // Pool burn.
      pool.burn(BigInt(tickLower), BigInt(tickUpper), BigInt(amount));

      // Wait for BurnEvent.
      const eventType = 'BurnEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 15 sec for the entities to be processed.
      await wait(15000);
    });

    it('should update Token entities', async () => {
      // Check txCount.
      let data: any;

      data = await request(endpoint, queryToken, { id: token0.address });
      const newToken0 = data.token;

      data = await request(endpoint, queryToken, { id: token1.address });
      const newToken1 = data.token;

      expect(newToken0.txCount).to.be.equal((BigInt(oldToken0.txCount) + BigInt(1)).toString());
      expect(newToken1.txCount).to.be.equal((BigInt(oldToken1.txCount) + BigInt(1)).toString());
    });

    it('should update Factory entity', async () => {
      // Check txCount.
      const data = await request(endpoint, queryFactory);
      const newFactory = data.factories[0];
      expect(newFactory.txCount).to.be.equal((BigInt(oldFactory.txCount) + BigInt(1)).toString());
    });

    it('should update Pool entity', async () => {
      // Check txCount, liquidity.
      let expectedLiquidity = BigInt(oldPool.liquidity);
      if (oldPool.tick !== null) {
        if (
          BigInt(tickLower) <= BigInt(oldPool.tick) &&
          BigInt(tickUpper) > BigInt(oldPool.tick)
        ) {
          expectedLiquidity = BigInt(oldPool.liquidity) - BigInt(amount);
        }
      }

      const data = await request(endpoint, queryPoolById, { id: pool.address });
      const newPool = data.pool;

      expect(newPool.txCount).to.be.equal((BigInt(oldPool.txCount) + BigInt(1)).toString());
      expect(BigInt(newPool.liquidity)).to.be.equal(expectedLiquidity);
    });

    it('should create a Burn entity', async () => {
      // Check id, origin, owner.
      // Get the latest Burn.
      let data: any;
      const variables = {
        first: 1,
        orderBy: 'timestamp',
        orderDirection: 'desc',
        pool: pool.address
      };

      data = await request(endpoint, queryBurns, variables);
      expect(data.burns).to.not.be.empty;

      const id: string = data.burns[0].id;
      const txCountID = id.split('#')[1];
      const origin = data.burns[0].origin;
      const owner = data.burns[0].owner;

      data = await request(endpoint, queryPoolById, { id: pool.address });
      const poolTxCount = data.pool.txCount;
      const expectedOrigin = recipient;
      const expectedOwner = recipient;

      expect(txCountID).to.be.equal(poolTxCount);
      expect(origin).to.be.equal(expectedOrigin);
      expect(owner).to.be.equal(expectedOwner);
    });

    it('should update Tick entities', async () => {
      // Check liquidityGross, liquidityNet.
      const data = await request(endpoint, queryTicks, { pool: pool.address });
      expect(data.ticks).to.not.be.empty;

      const newLowerTick: any = _.filter(data.ticks, { tickIdx: tickLower.toString() })[0];
      const newUpperTick: any = _.filter(data.ticks, { tickIdx: tickUpper.toString() })[0];

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
      checkUniswapDayData(endpoint);
    });

    it('should update PoolDayData entity', async () => {
      checkPoolDayData(endpoint, pool.address);
    });

    it('should update TokenDayData entities', async () => {
      checkTokenDayData(endpoint, token0.address);
      checkTokenDayData(endpoint, token1.address);
    });

    it('should update TokenHourData entities', async () => {
      checkTokenHourData(endpoint, token0.address);
      checkTokenHourData(endpoint, token1.address);
    });
  });

  describe('SwapEvent', () => {
    const sqrtPrice = '4295128938';

    // Initial entity values
    let eventValue: any;
    let oldFactory: any;
    let oldToken0: any;
    let oldToken1: any;
    let oldPool: any;

    before(async () => {
      // Get initial entity values.
      let data: any;

      data = await request(endpoint, queryFactory);
      oldFactory = data.factories[0];

      data = await request(endpoint, queryToken, { id: token0.address });
      oldToken0 = data.token;

      data = await request(endpoint, queryToken, { id: token1.address });
      oldToken1 = data.token;

      data = await request(endpoint, queryPoolById, { id: pool.address });
      oldPool = data.pool;
    });

    it('should trigger SwapEvent', async () => {
      // Pool swap.
      poolCallee.swapToLowerSqrtPrice(pool.address, BigInt(sqrtPrice), recipient);

      // Wait for SwapEvent.
      const eventType = 'SwapEvent';
      eventValue = await watchEvent(uniClient, eventType);

      // Sleeping for 5 sec for the entities to be processed.
      await wait(5000);
    });

    it('should update Token entities', async () => {
      // Check txCount.
      let data: any;

      data = await request(endpoint, queryToken, { id: token0.address });
      const newToken0 = data.token;

      data = await request(endpoint, queryToken, { id: token1.address });
      const newToken1 = data.token;

      expect(newToken0.txCount).to.be.equal((BigInt(oldToken0.txCount) + BigInt(1)).toString());
      expect(newToken1.txCount).to.be.equal((BigInt(oldToken1.txCount) + BigInt(1)).toString());
    });

    it('should update Factory entity', async () => {
      // Check txCount.
      const data = await request(endpoint, queryFactory);
      const newFactory = data.factories[0];
      expect(newFactory.txCount).to.be.equal((BigInt(oldFactory.txCount) + BigInt(1)).toString());
    });

    it('should update Pool entity', async () => {
      // Check txCount, liquidity, tick, sqrtPrice.
      const expectedLiquidity = eventValue.event.liquidity;
      const expectedTick = eventValue.event.tick;
      const expectedSqrtPrice = eventValue.event.sqrtPriceX96;

      const data = await request(endpoint, queryPoolById, { id: pool.address });
      const newPool = data.pool;

      expect(newPool.txCount).to.be.equal((BigInt(oldPool.txCount) + BigInt(1)).toString());
      expect(newPool.liquidity).to.be.equal(expectedLiquidity);
      expect(newPool.tick).to.be.equal(expectedTick);
      expect(newPool.sqrtPrice).to.be.equal(expectedSqrtPrice);
    });

    it('should create a Swap entity', async () => {
      // Check id, origin.
      // Get the latest Swap.
      let data: any;
      const variables = {
        first: 1,
        orderBy: 'timestamp',
        orderDirection: 'desc',
        pool: pool.address
      };

      data = await request(endpoint, querySwaps, variables);
      expect(data.swaps).to.not.be.empty;

      const id: string = data.swaps[0].id;
      const txCountID = id.split('#')[1];
      const origin = data.swaps[0].origin;

      data = await request(endpoint, queryPoolById, { id: pool.address });
      const poolTxCount = data.pool.txCount;
      const expectedOrigin = recipient;

      expect(txCountID).to.be.equal(poolTxCount);
      expect(origin).to.be.equal(expectedOrigin);
    });

    it('should update UniswapDayData entity', async () => {
      checkUniswapDayData(endpoint);
    });

    it('should update PoolDayData entity', async () => {
      checkPoolDayData(endpoint, pool.address);
    });

    it('should update TokenDayData entities', async () => {
      checkTokenDayData(endpoint, token0.address);
      checkTokenDayData(endpoint, token1.address);
    });

    it('should update TokenHourData entities', async () => {
      checkTokenHourData(endpoint, token0.address);
      checkTokenHourData(endpoint, token1.address);
    });
  });
});
