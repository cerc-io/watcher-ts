//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import Decimal from 'decimal.js';
import { ValueTransformer } from 'typeorm';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { utils, getDefaultProvider, providers } from 'ethers';

import { DEFAULT_CONFIG_PATH } from './constants';
import { Config } from './config';
import { JobQueue } from './job-queue';

/**
 * Method to wait for specified time.
 * @param time Time to wait in milliseconds
 */
export const wait = async (time: number): Promise<void> => new Promise(resolve => setTimeout(resolve, time));

/**
 * Transformer used by typeorm entity for Decimal type fields.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: Decimal) => {
    if (value) {
      return value.toString();
    }

    return value;
  },
  from: (value?: string) => {
    if (value) {
      return new Decimal(value);
    }

    return value;
  }
};

/**
 * Transformer used by typeorm entity for bigint type fields.
 */
export const bigintTransformer: ValueTransformer = {
  to: (value?: bigint) => {
    if (value) {
      return value.toString();
    }

    return value;
  },
  from: (value?: string) => {
    if (value) {
      return BigInt(value);
    }

    return value;
  }
};

export const resetJobs = async (config: Config): Promise<void> => {
  const { jobQueue: jobQueueConfig } = config;

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();
  await jobQueue.deleteAllJobs();
};

export const getResetYargs = (): yargs.Argv => {
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
    });
};

export const getCustomProvider = (network?: providers.Network | string, options?: any): providers.BaseProvider => {
  const provider = getDefaultProvider(network, options);
  provider.formatter = new CustomFormatter();
  return provider;
};

class CustomFormatter extends providers.Formatter {
  blockTag (blockTag: any): string {
    if (blockTag == null) { return 'latest'; }

    if (blockTag === 'earliest') { return '0x0'; }

    if (blockTag === 'latest' || blockTag === 'pending') {
      return blockTag;
    }

    if (typeof (blockTag) === 'number' || utils.isHexString(blockTag)) {
      // Return value if hex string is of block hash length.
      if (utils.isHexString(blockTag) && utils.hexDataLength(blockTag) === 32) {
        return blockTag;
      }

      return utils.hexValue(<number | string>blockTag);
    }

    throw new Error('invalid blockTag');
  }
}
