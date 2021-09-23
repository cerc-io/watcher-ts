//
// Copyright 2021 Vulcanize, Inc.
//

import solc from 'solc';
import { Writable } from 'stream';

/**
 * Compiles the given contract using solc and writes the resultant artifacts to a file.
 * @param outStream A writable output stream to write the artifacts file to.
 * @param contractContent Contents of the contract file to be compiled.
 * @param contractFileName Input contract file name.
 * @param contractName Name of the main contract in the contract file.
 */
export function exportArtifacts (outStream: Writable, contractContent: string, contractFileName: string, contractName: string): void {
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
  const output = JSON.parse(solc.compile(JSON.stringify(input))).contracts[contractFileName][contractName];
  outStream.write(JSON.stringify(output, null, 2));
}
