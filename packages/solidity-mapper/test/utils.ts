import { ContractInterface } from '@ethersproject/contracts';
import '@nomiclabs/hardhat-ethers';
import { artifacts, ethers } from 'hardhat';
import { CompilerOutput, CompilerOutputBytecode } from 'hardhat/types';

import { StorageLayout, GetStorageAt } from '../src';

// storageLayout doesnt exist in type CompilerOutput doesnt.
// Extending CompilerOutput type to include storageLayout property.
interface StorageCompilerOutput extends CompilerOutput {
  contracts: {
    [sourceName: string]: {
      [contractName: string]: {
        abi: ContractInterface;
        evm: {
          bytecode: CompilerOutputBytecode;
          deployedBytecode: CompilerOutputBytecode;
          methodIdentifiers: {
            [methodSignature: string]: string;
          };
        };
        storageLayout?: StorageLayout;
      }
    };
  };
}

/**
 * Get storage layout of specified contract.
 * @param contractName
 */
export const getStorageLayout = async (contractName: string): Promise<StorageLayout> => {
  const artifact = await artifacts.readArtifact(contractName);
  const buildInfo = await artifacts.getBuildInfo(`${artifact.sourceName}:${artifact.contractName}`);

  if (!buildInfo) {
    throw new Error('storageLayout not present in compiler output.');
  }

  const output: StorageCompilerOutput = buildInfo.output;
  const { storageLayout } = output.contracts[artifact.sourceName][artifact.contractName];

  if (!storageLayout) {
    throw new Error('Contract hasn\'t been compiled.');
  }

  return storageLayout;
};

/**
 * Get storage value in hardhat environment using ethers.
 * @param address
 * @param position
 */
export const getStorageAt: GetStorageAt = async ({ blockHash, contract, slot }) => {
  // TODO: Fix use of blockHash as hex string in getStorageAt.
  // Using blockHash in getStorageAt throws error.
  // https://github.com/ethers-io/ethers.js/pull/1550#issuecomment-841746994
  // Using latest tag for temporary fix in test scenario.
  blockHash = 'latest';
  const value = await ethers.provider.getStorageAt(contract, slot, blockHash);

  return {
    value,
    proof: {
      // Returning null value as proof, since ethers library getStorageAt method doesnt return proof.
      // This function is used in tests to mock the getStorageAt method of ipld-eth-client which returns proof along with value.
      data: JSON.stringify(null)
    }
  };
};

/**
 * Generate array of dummy addresses of specified length.
 * @param length
 */
export const generateDummyAddresses = (length: number): Array<string> => {
  return Array.from({ length }, () => {
    return ethers.utils.hexlify(ethers.utils.randomBytes(20));
  });
};
