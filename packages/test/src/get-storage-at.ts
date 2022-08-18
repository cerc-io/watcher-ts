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
      describe: 'Endpoint to perform getStorageAt against',
      type: 'string'
    },
    contract: {
      alias: 'c',
      demandOption: true,
      describe: 'Contract address',
      type: 'string'
    },
    slot: {
      alias: 's',
      demandOption: true,
      describe: 'Storge slot',
      type: 'string'
    },
    blockTag: {
      alias: 'b',
      describe: 'Block tag to make eth-call with (block number (hex) / block hash)',
      type: 'string'
    },
  }).argv;

  const provider = new providers.JsonRpcProvider(argv.endpoint);

  console.log(`Making a getStorageAt call for slot ${argv.slot} to endpoint ${argv.endpoint}`);
  const result = await provider.getStorageAt(argv.contract, argv.slot, argv.blockTag);

  console.log("Result:");
  console.log(result);
}

main().catch(err => {
  console.log(err);
});
