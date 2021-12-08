//
// Copyright 2021 Vulcanize, Inc.
//

import { Contract, ethers, Signer } from 'ethers';
import assert from 'assert';

import {
  getConfig, getResetConfig, JobQueue
} from '@vulcanize/util';
import {
  deployWETH9Token,
  deployNFPM
} from '@vulcanize/util/test';
import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';

import { Client as UniClient } from '../src/client';
import { Database } from '../src/database';
import { Indexer } from '../src/indexer';

const CONFIG_FILE = './environments/test.toml';

const deployFactoryContract = async (indexer: Indexer, signer: Signer): Promise<Contract> => {
  // Deploy factory from uniswap package.
  const Factory = new ethers.ContractFactory(FACTORY_ABI, FACTORY_BYTECODE, signer);
  const factory = await Factory.deploy();
  assert(factory.address, 'Factory contract not deployed.');

  // Watch factory contract.
  await indexer.watchContract(factory.address, 'factory', 100);

  return factory;
};

const deployNFPMContract = async (indexer: Indexer, signer: Signer, factory: Contract): Promise<void> => {
  // Deploy weth9 token.
  const weth9Address = await deployWETH9Token(signer);
  assert(weth9Address, 'WETH9 token not deployed.');

  // Deploy NonfungiblePositionManager.
  const nfpm = await deployNFPM(signer, factory, weth9Address);
  assert(nfpm.address, 'NFPM contract not deployed.');

  // Watch NFPM contract.
  await indexer.watchContract(nfpm.address, 'nfpm', 100);
};

const main = async () => {
  // Get config.
  const config = await getConfig(CONFIG_FILE);

  const { database: dbConfig, server: { host, port }, jobQueue: jobQueueConfig } = config;
  assert(dbConfig, 'Missing dbConfig.');
  assert(host, 'Missing host.');
  assert(port, 'Missing port.');

  const { ethClient, postgraphileClient, ethProvider } = await getResetConfig(config);

  // Initialize uniClient.
  const endpoint = `http://${host}:${port}/graphql`;
  const gqlEndpoint = endpoint;
  const gqlSubscriptionEndpoint = endpoint;
  const uniClient = new UniClient({
    gqlEndpoint,
    gqlSubscriptionEndpoint
  });

  // Initialize database.
  const db = new Database(dbConfig);
  await db.init();

  const provider = ethProvider as ethers.providers.JsonRpcProvider;
  const signer = provider.getSigner();

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(db, ethClient, postgraphileClient, ethProvider, jobQueue);

  let factory: Contract;
  // Checking whether factory is deployed.
  const factoryContract = await uniClient.getContract('factory');
  if (factoryContract == null) {
    factory = await deployFactoryContract(indexer, signer);
  } else {
    factory = new Contract(factoryContract.address, FACTORY_ABI, signer);
  }

  // Checking whether NFPM is deployed.
  const nfpmContract = await uniClient.getContract('nfpm');
  if (nfpmContract == null) {
    await deployNFPMContract(indexer, signer, factory);
  }

  // Closing the database.
  await db.close();
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
