import { expect, assert } from 'chai';
import { ethers, Contract, ContractTransaction, Signer, constants } from 'ethers';
import 'mocha';

import {
  Config,
  getConfig,
  deployTokens,
  deployUniswapV3Callee,
  TESTERC20_ABI,
  getMinTick,
  getMaxTick,
  approveToken
} from '@vulcanize/util';
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
import {
  abi as NFTD_ABI,
  bytecode as NFTD_BYTECODE
} from '@uniswap/v3-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json';
import {
  abi as NFTPD_ABI,
  bytecode as NFTPD_BYTECODE,
  linkReferences as NFTPD_LINKREFS
} from '@uniswap/v3-periphery/artifacts/contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json';
import {
  abi as NFPM_ABI,
  bytecode as NFPM_BYTECODE
} from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';

import { Indexer } from './indexer';
import { Database } from './database';
import { watchContract } from './utils/index';
import {
  linkLibraries,
  testCreatePool,
  testInitialize,
  checkMintEvent,
  checkBurnEvent,
  checkSwapEvent,
  checkTransferEvent,
  checkIncreaseLiquidityEvent,
  checkDecreaseLiquidityEvent,
  checksCollectEvent
} from '../test/utils';
import {
  abi as WETH9_ABI,
  bytecode as WETH9_BYTECODE
} from '../artifacts/test/contracts/WETH9.sol/WETH9.json';

const NETWORK_RPC_URL = 'http://localhost:8545';

const TICK_MIN = -887272;
const TICK_MAX = 887272;

describe('uni-watcher', () => {
  let factory: Contract;
  let pool: Contract;
  let token0: Contract;
  let token1: Contract;
  let poolCallee: Contract;
  let token0Address: string;
  let token1Address: string;
  let weth9Address: string;
  let nfpm: Contract;

  let tickLower: number;
  let tickUpper: number;
  let config: Config;
  let db: Database;
  let uniClient: UniClient;
  let ethClient: EthClient;
  let postgraphileClient: EthClient;
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

    postgraphileClient = new EthClient({
      gqlEndpoint: gqlPostgraphileEndpoint,
      cache
    });

    const endpoint = `http://${host}:${port}/graphql`;
    const gqlEndpoint = endpoint;
    const gqlSubscriptionEndpoint = endpoint;
    uniClient = new UniClient({
      gqlEndpoint,
      gqlSubscriptionEndpoint
    });

    const provider = new ethers.providers.JsonRpcProvider(NETWORK_RPC_URL);
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
    const indexer = new Indexer(config, db, ethClient, postgraphileClient);
    assert(await indexer.isUniswapContract(factory.address), 'Factory contract not added to database.');
  });

  it('should deploy 2 tokens', async () => {
    // Deploy 2 tokens.

    // Not initializing global token contract variables just yet; initialized in `create pool` to maintatin order coherency.
    ({ token0Address, token1Address } = await deployTokens(signer));
    expect(token0Address).to.not.be.empty;
    expect(token1Address).to.not.be.empty;
  });

  it('should create pool', async () => {
    const fee = 500;

    pool = await testCreatePool(uniClient, factory, token0Address, token1Address, fee, POOL_ABI, signer);

    // Getting tokens from pool as their order might be swapped (Need to do only once for two specific tokens).
    token0Address = await pool.token0();
    token0 = new Contract(token0Address, TESTERC20_ABI, signer);
    token1Address = await pool.token1();
    token1 = new Contract(token1Address, TESTERC20_ABI, signer);

    // Initializing ticks.
    const tickSpacing = await pool.tickSpacing();
    // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
    tickLower = getMinTick(tickSpacing);
    tickUpper = getMaxTick(tickSpacing);
  });

  it('should initialize pool', async () => {
    const sqrtPrice = '4295128939';

    await testInitialize(uniClient, pool, sqrtPrice, TICK_MIN);
  });

  it('should mint specified amount', done => {
    (async () => {
      const amount = 10;
      const approveAmount = BigInt(1000000000000000000000000);

      // Deploy UniswapV3Callee.
      poolCallee = await deployUniswapV3Callee(signer);

      await approveToken(token0, poolCallee.address, approveAmount);
      await approveToken(token1, poolCallee.address, approveAmount);

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'MintEvent') {
          const expectedContract: string = pool.address;
          const expectedSender: string = poolCallee.address;
          const exptectedOwner: string = recipient;

          checkMintEvent(value, expectedContract, expectedSender, exptectedOwner, tickLower, tickUpper, amount);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Pool mint.
      const transaction: ContractTransaction = await poolCallee.mint(pool.address, recipient, BigInt(tickLower), BigInt(tickUpper), BigInt(amount));
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should burn specified amount', done => {
    (async () => {
      const amount = 10;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'BurnEvent') {
          const expectedContract: string = pool.address;
          const exptectedOwner: string = recipient;

          checkBurnEvent(value, expectedContract, exptectedOwner, tickLower, tickUpper, amount);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Pool burn.
      const transaction: ContractTransaction = await pool.burn(BigInt(tickLower), BigInt(tickUpper), BigInt(amount));
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should swap pool tokens', done => {
    (async () => {
      const sqrtPrice = '4295128938';

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'SwapEvent') {
          const expectedContract: string = pool.address;
          const exptectedSender: string = poolCallee.address;

          checkSwapEvent(value, expectedContract, exptectedSender, recipient, sqrtPrice, TICK_MIN);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      const transaction: ContractTransaction = await poolCallee.swapToLowerSqrtPrice(pool.address, BigInt(sqrtPrice), recipient);
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should deploy a WETH9 token', async () => {
    // Deploy weth9 token.
    const WETH9 = new ethers.ContractFactory(WETH9_ABI, WETH9_BYTECODE, signer);
    const weth9 = await WETH9.deploy();

    weth9Address = weth9.address;
    expect(weth9.address).to.not.be.empty;
  });

  it('should deploy NonfungiblePositionManager', async () => {
    // Deploy NonfungiblePositionManager.
    // https://github.com/Uniswap/uniswap-v3-periphery/blob/main/test/shared/completeFixture.ts#L31
    const nftDescriptorLibraryFactory = new ethers.ContractFactory(NFTD_ABI, NFTD_BYTECODE, signer);
    const nftDescriptorLibrary = await nftDescriptorLibraryFactory.deploy();
    expect(nftDescriptorLibrary.address).to.not.be.empty;

    // Linking NFTDescriptor library to NFTPD before deploying.
    const linkedNFTPDBytecode = linkLibraries({
      bytecode: NFTPD_BYTECODE,
      linkReferences: NFTPD_LINKREFS
    }, {
      NFTDescriptor: nftDescriptorLibrary.address
    }
    );

    const positionDescriptorFactory = new ethers.ContractFactory(
      NFTPD_ABI,
      linkedNFTPDBytecode,
      signer);
    const nftDescriptor = await positionDescriptorFactory.deploy(weth9Address);
    expect(nftDescriptor.address).to.not.be.empty;

    const positionManagerFactory = new ethers.ContractFactory(
      NFPM_ABI,
      NFPM_BYTECODE,
      signer);
    nfpm = await positionManagerFactory.deploy(factory.address, weth9Address, nftDescriptor.address);

    expect(nfpm.address).to.not.be.empty;
  });

  it('should watch NonfungiblePositionManager contract', async () => {
    // Watch factory contract.
    await watchContract(db, nfpm.address, 'nfpm', 100);

    // Verifying with the db.
    const indexer = new Indexer(config, db, ethClient, postgraphileClient);
    assert(await indexer.isUniswapContract(nfpm.address), 'NonfungiblePositionManager contract not added to database.');
  });

  it('should mint specified amount: nfpm', done => {
    (async () => {
      const fee = 3000;
      pool = await testCreatePool(uniClient, factory, token0Address, token1Address, fee, POOL_ABI, signer);

      const tickSpacing = await pool.tickSpacing();
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
      tickLower = getMinTick(tickSpacing);
      tickUpper = getMaxTick(tickSpacing);

      const sqrtPrice = '79228162514264337593543950336';
      await testInitialize(uniClient, pool, sqrtPrice, 0);

      const amount0Desired = 15;
      const amount1Desired = 15;
      const amount0Min = 0;
      const amount1Min = 0;
      const deadline = 1634367993;

      // Approving tokens for NonfungiblePositionManager contract.
      // https://github.com/Uniswap/uniswap-v3-periphery/blob/main/test/NonfungiblePositionManager.spec.ts#L44
      const t0 = await token0.approve(nfpm.address, constants.MaxUint256);
      await t0.wait();

      const t1 = await token1.approve(nfpm.address, constants.MaxUint256);
      await t1.wait();

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        // TODO Verify what should amount values be checked against.
        if (value.event.__typename === 'MintEvent') {
          const expectedContract: string = pool.address;
          const expectedSender: string = nfpm.address;
          const exptectedOwner: string = nfpm.address;

          checkMintEvent(value, expectedContract, expectedSender, exptectedOwner, tickLower, tickUpper, amount1Desired);
        }
        if (value.event.__typename === 'TransferEvent') {
          const expectedContract: string = nfpm.address;
          const from = '0x0000000000000000000000000000000000000000';

          checkTransferEvent(value, expectedContract, from, recipient);
        }
        if (value.event.__typename === 'IncreaseLiquidityEvent') {
          const expectedContract: string = nfpm.address;

          checkIncreaseLiquidityEvent(value, expectedContract, amount1Desired);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger mint.
      const transaction: ContractTransaction = await nfpm.mint({
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
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should increase liquidity', done => {
    (async () => {
      const tokenId = 1;
      const amount0Desired = 15;
      const amount1Desired = 15;
      const amount0Min = 0;
      const amount1Min = 0;
      const deadline = 1634367993;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'MintEvent') {
          const expectedContract: string = pool.address;
          const expectedSender: string = nfpm.address;
          const exptectedOwner: string = nfpm.address;

          checkMintEvent(value, expectedContract, expectedSender, exptectedOwner, tickLower, tickUpper, amount0Desired);
        }
        if (value.event.__typename === 'IncreaseLiquidityEvent') {
          const expectedContract: string = nfpm.address;

          checkIncreaseLiquidityEvent(value, expectedContract, amount0Desired);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger increase liquidity.
      const transaction: ContractTransaction = await nfpm.increaseLiquidity({
        tokenId,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        deadline
      });
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  it('should decrease liquidity', done => {
    (async () => {
      const tokenId = 1;
      const liquidity = 5;
      const amount0Min = 0;
      const amount1Min = 0;
      const deadline = 1634367993;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'BurnEvent') {
          const expectedContract: string = pool.address;
          const exptectedOwner: string = nfpm.address;

          checkBurnEvent(value, expectedContract, exptectedOwner, tickLower, tickUpper, liquidity);
        }
        if (value.event.__typename === 'DecreaseLiquidityEvent') {
          const expectedContract: string = nfpm.address;

          checkDecreaseLiquidityEvent(value, expectedContract, liquidity);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger decrease liquidity.
      const transaction: ContractTransaction = await nfpm.decreaseLiquidity({
        tokenId,
        liquidity,
        amount0Min,
        amount1Min,
        deadline
      });
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });

  xit('should collect fees', done => {
    (async () => {
      const tokenId = 1;
      const amount0Max = 15;
      const amount1Max = 15;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'BurnEvent') {
          const expectedContract: string = pool.address;
          const exptectedOwner: string = nfpm.address;

          checkBurnEvent(value, expectedContract, exptectedOwner, tickLower, tickUpper, 0);
        }
        if (value.event.__typename === 'CollectEvent') {
          const expectedContract: string = nfpm.address;

          checksCollectEvent(value, expectedContract, recipient);

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger increase liquidity.
      const transaction: ContractTransaction = await nfpm.collect({
        tokenId,
        recipient,
        amount0Max,
        amount1Max
      });
      await transaction.wait();
    })().catch((error) => {
      done(error);
    });
  });
});
