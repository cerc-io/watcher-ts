//
// Copyright 2021 Vulcanize, Inc.
//

import { ethers, Contract, ContractTransaction, Signer, BigNumber, utils } from 'ethers';
import assert from 'assert';

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

import {
  abi as TESTERC20_ABI,
  bytecode as TESTERC20_BYTECODE
} from '../artifacts/test/contracts/TestERC20.sol/TestERC20.json';
import {
  abi as TESTUNISWAPV3CALLEE_ABI,
  bytecode as TESTUNISWAPV3CALLEE_BYTECODE
} from '../artifacts/test/contracts/TestUniswapV3Callee.sol/TestUniswapV3Callee.json';
import {
  abi as WETH9_ABI,
  bytecode as WETH9_BYTECODE
} from '../artifacts/test/contracts/WETH9.sol/WETH9.json';

import { DatabaseInterface } from '../src/types';

export { abi as NFPM_ABI } from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
export { abi as TESTERC20_ABI } from '../artifacts/test/contracts/TestERC20.sol/TestERC20.json';

export const TICK_MIN = -887272;
export const TICK_MAX = 887272;

export const getMinTick = (tickSpacing: number): number => {
  return Math.ceil(TICK_MIN / tickSpacing) * tickSpacing;
};

export const getMaxTick = (tickSpacing: number): number => {
  return Math.floor(TICK_MAX / tickSpacing) * tickSpacing;
};

export const deployTokens = async (signer: Signer): Promise<{token0Address: string, token1Address: string}> => {
  const Token = new ethers.ContractFactory(TESTERC20_ABI, TESTERC20_BYTECODE, signer);

  const token0 = await Token.deploy(ethers.BigNumber.from(2).pow(255));
  const token0Address = token0.address;

  const token1 = await Token.deploy(ethers.BigNumber.from(2).pow(255));
  const token1Address = token1.address;

  return { token0Address, token1Address };
};

export const deployUniswapV3Callee = async (signer: Signer): Promise<Contract> => {
  const TestUniswapV3Callee = new ethers.ContractFactory(TESTUNISWAPV3CALLEE_ABI, TESTUNISWAPV3CALLEE_BYTECODE, signer);
  return await TestUniswapV3Callee.deploy();
};

export const approveToken = async (token: Contract, address: string, approveAmount: bigint): Promise<void> => {
  const transaction: ContractTransaction = await token.approve(address, approveAmount);
  await transaction.wait();
};

export const createPool = async (
  factory: Contract,
  token0Address: string,
  token1Address: string,
  fee: number): Promise<void> => {
  const transaction: ContractTransaction = await factory.createPool(token0Address, token1Address, fee);
  await transaction.wait();
};

export const initializePool = async (pool: Contract, sqrtPrice: string): Promise<void> => {
  const transaction: ContractTransaction = await pool.initialize(BigNumber.from(sqrtPrice));
  await transaction.wait();
};

export const deployWETH9Token = async (signer: Signer): Promise<string> => {
  const WETH9 = new ethers.ContractFactory(WETH9_ABI, WETH9_BYTECODE, signer);
  const weth9 = await WETH9.deploy();

  return weth9.address;
};

// https://github.com/ethers-io/ethers.js/issues/195
const linkLibraries = (
  {
    bytecode,
    linkReferences
  }: {
    bytecode: string
    linkReferences: { [fileName: string]: { [contractName: string]: { length: number; start: number }[] } }
  },
  libraries: { [libraryName: string]: string }): string => {
  Object.keys(linkReferences).forEach((fileName) => {
    Object.keys(linkReferences[fileName]).forEach((contractName) => {
      if (!Object.prototype.hasOwnProperty.call(libraries, contractName)) {
        throw new Error(`Missing link library name ${contractName}`);
      }
      const address = utils.getAddress(libraries[contractName]).toLowerCase().slice(2);
      linkReferences[fileName][contractName].forEach(({ start: byteStart, length: byteLength }) => {
        const start = 2 + byteStart * 2;
        const length = byteLength * 2;
        bytecode = bytecode
          .slice(0, start)
          .concat(address)
          .concat(bytecode.slice(start + length, bytecode.length));
      });
    });
  });
  return bytecode;
};

export const deployNFPM = async (signer: Signer, factory: Contract, weth9Address: string): Promise<Contract> => {
  // Deploy NonfungiblePositionManager.
  // https://github.com/Uniswap/uniswap-v3-periphery/blob/main/test/shared/completeFixture.ts#L31
  const nftDescriptorLibraryFactory = new ethers.ContractFactory(NFTD_ABI, NFTD_BYTECODE, signer);
  const nftDescriptorLibrary = await nftDescriptorLibraryFactory.deploy();
  assert(nftDescriptorLibrary.address, 'NFTDescriptorLibrary not deployed.');

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
  assert(nftDescriptor.address, 'NFTDescriptor not deployed.');

  const positionManagerFactory = new ethers.ContractFactory(
    NFPM_ABI,
    NFPM_BYTECODE,
    signer);
  return await positionManagerFactory.deploy(factory.address, weth9Address, nftDescriptor.address);
};

export const insertDummyBlock = async (db: DatabaseInterface, parentBlock: any): Promise<any> => {
  // Insert a dummy BlockProgress entity after parentBlock.

  const dbTx = await db.createTransactionRunner();

  try {
    const randomByte = ethers.utils.randomBytes(10);
    const blockHash = ethers.utils.sha256(randomByte);
    const blockTimestamp = Math.floor(Date.now() / 1000);
    const parentHash = parentBlock.hash;
    const blockNumber = parentBlock.number + 1;

    const block = {
      blockNumber,
      blockHash,
      blockTimestamp,
      parentHash
    };

    await db.updateSyncStatusChainHead(dbTx, blockHash, blockNumber);
    await db.saveEvents(dbTx, block, []);
    await db.updateSyncStatusIndexedBlock(dbTx, blockHash, blockNumber);

    await dbTx.commitTransaction();

    return {
      number: blockNumber,
      hash: blockHash,
      timestamp: blockTimestamp,
      parent: {
        hash: parentHash
      }
    };
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }
};

export const insertNDummyBlocks = async (db: DatabaseInterface, numberOfBlocks:number, parentBlock?: any): Promise<any[]> => {
  // Insert n dummy BlockProgress serially after parentBlock.

  const blocksArray: any[] = [];
  if (!parentBlock) {
    const randomByte = ethers.utils.randomBytes(10);
    const hash = ethers.utils.sha256(randomByte);
    parentBlock = {
      number: 0,
      hash,
      timestamp: -1,
      parent: {
        hash: ''
      }
    };
  }

  let block = parentBlock;
  for (let i = 0; i < numberOfBlocks; i++) {
    block = await insertDummyBlock(db, block);
    blocksArray.push(block);
  }

  return blocksArray;
};

export async function removeEntities<Entity> (db: DatabaseInterface, entity: new () => Entity): Promise<void> {
  // Remove all entries of the specified entity from database.

  const dbTx = await db.createTransactionRunner();

  try {
    await db.removeEntities(dbTx, entity);
    dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }
}
