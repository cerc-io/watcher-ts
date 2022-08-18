//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import { ethers, providers } from 'ethers';

import { readAbi } from './common';

const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    endpoint: {
      alias: 'e',
      demandOption: true,
      describe: 'Endpoint to perform eth-call against',
      type: 'string'
    },
    contract: {
      alias: 'c',
      demandOption: true,
      describe: 'Contract address',
      type: 'string'
    },
    abi: {
      alias: 'a',
      demandOption: true,
      describe: 'Contract ABI path',
      type: 'string'
    },
    methodName: {
      alias: 'm',
      demandOption: true,
      describe: 'Contract method to call',
      type: 'string'
    },
    methodArgs: {
      describe: 'Contract method arguments',
      type: 'array'
    },
    blockTag: {
      alias: 'b',
      describe: 'Block tag to make eth-call with (block number (hex) / block hash)',
      type: 'string'
    }
  }).argv;

  const abi = readAbi(argv.abi);
  const provider = new providers.JsonRpcProvider(argv.endpoint);
  const contract = new ethers.Contract(argv.contract, abi, provider);

  let args: (string | number)[] = []
  if(argv.methodArgs !== undefined) {
    args = argv.methodArgs
  }

  console.log(`Making an eth-call (${argv.methodName}) to endpoint ${argv.endpoint}`);
  const result = await contract[argv.methodName](...args, {blockTag: argv.blockTag});

  console.log("Result:");
  console.log(result);
}

main().catch(err => {
  console.log(err);
});
