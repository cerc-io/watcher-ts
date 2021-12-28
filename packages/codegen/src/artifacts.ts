//
// Copyright 2021 Vulcanize, Inc.
//

import solc from 'solc';

/**
 * Compiles the given contract using solc and returns resultant artifacts.
 * @param contractContent Contents of the contract file to be compiled.
 * @param contractFileName Input contract file name.
 * @param contractName Name of the main contract in the contract file.
 */
export function generateArtifacts (contractContent: string, contractFileName: string, contractName: string): { abi: any[], storageLayout: any } {
  const input: any = {
    language: 'Solidity',
    sources: {},
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'storageLayout']
        }
      }
    }
  };

  input.sources[contractFileName] = {
    content: contractContent
  };

  // Get artifacts for the required contract.
  return JSON.parse(solc.compile(JSON.stringify(input))).contracts[contractFileName][contractName];
}
