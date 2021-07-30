import { expect, assert } from 'chai';
import { ethers, Contract, Signer } from 'ethers';
import 'reflect-metadata';
import 'mocha';

import { Config, getConfig } from '@vulcanize/util';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';
import {
  abi as POOL_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';

import { Indexer } from './indexer';
import { Database } from './database';
import { watchContract } from './utils/index';
import { testCreatePool, testInitialize } from '../test/utils';
import {
  abi as TESTERC20_ABI,
  bytecode as TESTERC20_BYTECODE
} from '../artifacts/test/contracts/TestERC20.sol/TestERC20.json';
import {
  abi as TESTUNISWAPV3CALLEE_ABI,
  bytecode as TESTUNISWAPV3CALLEE_BYTECODE
} from '../artifacts/test/contracts/TestUniswapV3Callee.sol/TestUniswapV3Callee.json';

const TICK_MIN = -887272;
const TICK_MAX = 887272;
const getMinTick = (tickSpacing: number) => Math.ceil(TICK_MIN / tickSpacing) * tickSpacing;
const getMaxTick = (tickSpacing: number) => Math.floor(TICK_MAX / tickSpacing) * tickSpacing;

describe('uni-watcher', () => {
  let factory: Contract;
  let token0: Contract;
  let token1: Contract;
  let pool: Contract;

  let poolAddress: string;
  let tickLower: number;
  let tickUpper: number;
  let config: Config;
  let db: Database;
  let uniClient: UniClient;
  let ethClient: EthClient;
  let signer: Signer;
  let recipient: string;

  before(async () => {
    const configFile = './environments/local.toml';
    config = await getConfig(configFile);

    const { database: dbConfig, upstream, server: { host, port } } = config;
    assert(dbConfig, 'Missing dbConfig.');
    assert(upstream, 'Missing upstream.');
    assert(host, 'Missing host.');
    assert(port, 'Missing port.');

    const { ethServer: { gqlApiEndpoint, gqlPostgraphileEndpoint }, cache: cacheConfig } = upstream;
    assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint.');
    assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint.');
    assert(cacheConfig, 'Missing dbConfig.');

    db = new Database(dbConfig);
    await db.init();

    const cache = await getCache(cacheConfig);
    ethClient = new EthClient({
      gqlEndpoint: gqlApiEndpoint,
      gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
      cache
    });

    const endpoint = `http://${host}:${port}/graphql`;
    const gqlEndpoint = endpoint;
    const gqlSubscriptionEndpoint = endpoint;
    uniClient = new UniClient({
      gqlEndpoint,
      gqlSubscriptionEndpoint
    });

    const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    signer = provider.getSigner();
    recipient = await signer.getAddress();
  });

  after(async () => {
    await db.close();
  });

  it('should deploy contract factory', async () => {
    // Deploy factory from uniswap package.
    const Factory = new ethers.ContractFactory(FACTORY_ABI, FACTORY_BYTECODE, signer);
    factory = await Factory.deploy();

    expect(factory.address).to.not.be.empty;
  });

  it('should watch factory contract', async () => {
    // Watch factory contract.
    await watchContract(db, factory.address, 'factory', 100);

    // Verifying with the db.
    const indexer = new Indexer(config, db, ethClient);
    assert(await indexer.isUniswapContract(factory.address), 'Factory contract not added to database.');
  });

  it('should deploy 2 tokens', async () => {
    // Deploy 2 tokens.
    const Token = new ethers.ContractFactory(TESTERC20_ABI, TESTERC20_BYTECODE, signer);

    token0 = await Token.deploy(ethers.BigNumber.from(2).pow(255));
    expect(token0.address).to.not.be.empty;

    token1 = await Token.deploy(ethers.BigNumber.from(2).pow(255));
    expect(token1.address).to.not.be.empty;
  });

  it('should create pool', async () => {
    const fee = 500;

    pool = await testCreatePool(uniClient, factory, token0, token1, POOL_ABI, signer, fee);
    poolAddress = pool.address;
  });

  it('should initialize pool', async () => {
    const sqrtPrice = '4295128939';

    await testInitialize(uniClient, pool, TICK_MIN, sqrtPrice);
  });

  it('should mint specified amount', done => {
    (async () => {
      const amount = '10';
      const approveAmount = BigInt(1000000000000000000000000);

      const TestUniswapV3Callee = new ethers.ContractFactory(TESTUNISWAPV3CALLEE_ABI, TESTUNISWAPV3CALLEE_BYTECODE, signer);
      const poolCallee = await TestUniswapV3Callee.deploy();

      const tickSpacing = await pool.tickSpacing();
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
      tickLower = getMinTick(tickSpacing);
      tickUpper = getMaxTick(tickSpacing);

      // Approving tokens for TestUniswapV3Callee contract.
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/shared/utilities.ts#L187
      const t0 = await token0.approve(poolCallee.address, approveAmount);
      await t0.wait();

      const t1 = await token1.approve(poolCallee.address, approveAmount);
      await t1.wait();

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'MintEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(pool.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('MintEvent');
          expect(value.event.sender).to.equal(poolCallee.address);
          expect(value.event.owner).to.equal(recipient);
          expect(value.event.tickLower).to.equal(tickLower.toString());
          expect(value.event.tickUpper).to.equal(tickUpper.toString());
          expect(value.event.amount).to.equal(amount);
          expect(value.event.amount0).to.not.be.empty;
          expect(value.event.amount1).to.not.be.empty;

          expect(value.proof).to.not.be.empty;

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Pool mint.
      await poolCallee.mint(pool.address, recipient, BigInt(tickLower), BigInt(tickUpper), BigInt(amount));
    })().catch((error) => {
      console.error(error);
    });
  });

  it('should burn specified amount', done => {
    (async () => {
      const amount = '10';

      const tickSpacing = await pool.tickSpacing();
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
      const tickLower = getMinTick(tickSpacing);
      const tickUpper = getMaxTick(tickSpacing);

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'BurnEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(pool.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('BurnEvent');
          expect(value.event.owner).to.equal(recipient);
          expect(value.event.tickLower).to.equal(tickLower.toString());
          expect(value.event.tickUpper).to.equal(tickUpper.toString());
          expect(value.event.amount).to.equal(amount);
          expect(value.event.amount0).to.not.be.empty;
          expect(value.event.amount1).to.not.be.empty;

          expect(value.proof).to.not.be.empty;

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Pool burn.
      await pool.burn(BigInt(tickLower), BigInt(tickUpper), BigInt(amount));
    })().catch((error) => {
      console.error(error);
    });
  });

  it('should swap pool tokens', done => {
    (async () => {
      const sqrtPrice = '4295128938';

      const TestUniswapV3Callee = new ethers.ContractFactory(TESTUNISWAPV3CALLEE_ABI, TESTUNISWAPV3CALLEE_BYTECODE, signer);
      const poolCallee = await TestUniswapV3Callee.deploy();

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'SwapEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(poolAddress);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('SwapEvent');
          expect(value.event.sender).to.equal(poolCallee.address);
          expect(value.event.recipient).to.equal(recipient);
          expect(value.event.amount0).to.not.be.empty;
          expect(value.event.amount1).to.not.be.empty;
          expect(value.event.sqrtPriceX96).to.equal(sqrtPrice);
          expect(value.event.liquidity).to.not.be.empty;
          expect(value.event.tick).to.equal(TICK_MIN.toString());

          expect(value.proof).to.not.be.empty;

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      await poolCallee.swapToLowerSqrtPrice(poolAddress, BigInt(sqrtPrice), recipient);
    })().catch((error) => {
      console.error(error);
    });
  });
});
