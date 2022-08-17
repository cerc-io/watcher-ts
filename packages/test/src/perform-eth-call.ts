//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';

import { readAbi, performEthCall } from './common'

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
    blockTag: {
      alias: 'b',
      describe: 'Block tag to make eth-call with (block number (hex) / block hash)',
      type: 'string'
    }
  }).argv;
  
  const abi = readAbi(argv.abi)
  const result = await performEthCall(argv.endpoint, argv.contract, abi, argv.blockTag);
  
  console.log("Result:")
  console.log(result)
}

main().catch(err => {
  console.log(err);
});
