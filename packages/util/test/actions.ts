import { ethers, Contract, ContractTransaction, Signer, BigNumber } from 'ethers';

import {
  abi as TESTERC20_ABI,
  bytecode as TESTERC20_BYTECODE
} from '../artifacts/test/contracts/TestERC20.sol/TestERC20.json';

export { abi as TESTERC20_ABI } from '../artifacts/test/contracts/TestERC20.sol/TestERC20.json';

export const deployTokens = async (signer: Signer): Promise<{token0Address: string, token1Address: string}> => {
  const Token = new ethers.ContractFactory(TESTERC20_ABI, TESTERC20_BYTECODE, signer);

  const token0 = await Token.deploy(ethers.BigNumber.from(2).pow(255));
  const token0Address = token0.address;

  const token1 = await Token.deploy(ethers.BigNumber.from(2).pow(255));
  const token1Address = token1.address;

  return { token0Address, token1Address };
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
