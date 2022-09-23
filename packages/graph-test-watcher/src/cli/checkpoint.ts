//
// Copyright 2021 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';

import { DEFAULT_CONFIG_PATH } from '@cerc-io/util';

import { hideBin } from 'yargs/helpers';

const log = debug('vulcanize:checkpoint');

const main = async () => {
  return yargs(hideBin(process.argv))
    .parserConfiguration({
      'parse-numbers': false
    }).options({
      configFile: {
        alias: 'f',
        type: 'string',
        require: true,
        demandOption: true,
        describe: 'configuration file path (toml)',
        default: DEFAULT_CONFIG_PATH
      }
    })
    .commandDir('checkpoint-cmds', { extensions: ['ts', 'js'], exclude: /([a-zA-Z0-9\s_\\.\-:])+(.d.ts)$/ })
    .demandCommand(1)
    .help()
    .argv;
};

main().then(() => {
  process.exit();
}).catch(err => {
  log(err);
});
