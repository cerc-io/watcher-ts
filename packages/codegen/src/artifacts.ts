//
// Copyright 2021 Vulcanize, Inc.
//

import solc from 'solc';

interface Solc {
  compile(input: string): any;
}

/**
 * Compiles the given contract using solc and returns resultant artifacts.
 * @param contractContent Contents of the contract file to be compiled.
 * @param contractFileName Input contract file name.
 * @param contractName Name of the main contract in the contract file.
 */
export async function generateArtifacts (contractContent: string, contractFileName: string, contractName: string, solcVersion: string): Promise<{ abi: any[], storageLayout: any }> {
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

  const solcInstance = (solcVersion === undefined) ? solc : await getSolcByVersion(solcVersion);
  const compiledContract = JSON.parse(solcInstance.compile(JSON.stringify(input)));

  if (compiledContract.errors?.length) {
    compiledContract.errors.forEach((error: any) => {
      if (error.severity === 'error') {
        throw new Error(error.formattedMessage);
      }

      console.log(`${error.severity}: ${error.formattedMessage}`);
    });
  }

  // Get artifacts for the required contract.
  return compiledContract.contracts[contractFileName][contractName];
}

async function getSolcByVersion (solcVersion: string): Promise<Solc> {
  return new Promise((resolve, reject) => {
    solc.loadRemoteVersion(solcVersion, (err: any, solcInstance: Solc | Promise<any>) => {
      if (err) {
        reject(err);
      } else {
        resolve(solcInstance);
      }
    });
  });
}
