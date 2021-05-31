import { artifacts, ethers } from 'hardhat'
import { CompilerOutput, CompilerOutputBytecode } from 'hardhat/types';

import { StorageLayout, GetStorageAt } from '../src';

// storageLayout doesnt exist in type CompilerOutput doesnt.
// Extending CompilerOutput type to include storageLayout property.
interface StorageCompilerOutput extends CompilerOutput {
  contracts: {
    [sourceName: string]: {
      [contractName: string]: {
        abi: any;
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
export const getStorageLayout = async (contractName: string) => {
  const artifact = await artifacts.readArtifact(contractName);
  const buildInfo = await artifacts.getBuildInfo(`${artifact.sourceName}:${artifact.contractName}`)

  if (!buildInfo) {
    throw new Error('storageLayout not present in compiler output.');
  }

  const output: StorageCompilerOutput = buildInfo.output
  const { storageLayout } = output.contracts[artifact.sourceName][artifact.contractName];

  if (!storageLayout) {
    throw new Error(`Contract hasn't been compiled.`);
  }

  return storageLayout;
}

/**
 * Get storage value in hardhat environment using ethers.
 * @param address
 * @param position
 */
export const getStorageAt: GetStorageAt = async (address, position) => {
  const value = await ethers.provider.getStorageAt(address, position);

  return value;
}
