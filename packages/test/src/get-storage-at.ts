//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import { providers } from 'ethers';
import debug from 'debug';

const log = debug('vulcanize:test');

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

  log(`Making a getStorageAt call for slot ${argv.slot} to endpoint ${argv.endpoint}`);
  const result = await provider.getStorageAt(argv.contract, argv.slot, argv.blockTag);

  log("Result:");
  log(result);
}

main().catch(err => {
  log(err);
});
