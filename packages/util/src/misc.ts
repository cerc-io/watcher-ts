//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { ValueTransformer } from 'typeorm';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { utils, providers } from 'ethers';
import Decimal from 'decimal.js';
import debug from 'debug';

import { EthClient } from '@cerc-io/ipld-eth-client';

import { DEFAULT_CONFIG_PATH } from './constants';
import { Config } from './config';
import { JobQueue } from './job-queue';
import { GraphDecimal } from './graph-decimal';
import * as EthDecoder from './eth';
import { getCachedBlockSize } from './block-size-cache';

/**
 * Method to wait for specified time.
 * @param time Time to wait in milliseconds
 */
export const wait = async (time: number): Promise<void> => new Promise(resolve => setTimeout(resolve, time));

/**
 * Transformer used by typeorm entity for GraphDecimal type fields.
 */
export const graphDecimalTransformer: ValueTransformer = {
  to: (value?: GraphDecimal) => {
    if (value) {
      return value.toFixed();
    }

    return value;
  },
  from: (value?: string) => {
    if (value) {
      return new GraphDecimal(value);
    }

    return value;
  }
};

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

export const bigintArrayTransformer: ValueTransformer = {
  to: (valueArray?: bigint[]) => {
    if (valueArray) {
      return valueArray.map(value => bigintTransformer.to(value));
    }

    return valueArray;
  },
  from: (valueArray?: string[]) => {
    if (valueArray) {
      return valueArray.map(value => bigintTransformer.from(value));
    }

    return valueArray;
  }
};

export const decimalArrayTransformer: ValueTransformer = {
  to: (valueArray?: Decimal[]) => {
    if (valueArray) {
      return valueArray.map(value => decimalTransformer.to(value));
    }

    return valueArray;
  },
  from: (valueArray?: string[]) => {
    if (valueArray) {
      return valueArray.map(value => decimalTransformer.from(value));
    }

    return valueArray;
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

export const getCustomProvider = (url?: utils.ConnectionInfo | string, network?: providers.Networkish): providers.JsonRpcProvider => {
  const provider = new providers.JsonRpcProvider(url, network);
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

export const getFullBlock = async (ethClient: EthClient, ethProvider: providers.BaseProvider, blockHash: string): Promise<any> => {
  const {
    allEthHeaderCids: {
      nodes: [
        fullBlock
      ]
    }
  } = await ethClient.getFullBlocks({ blockHash });

  assert(fullBlock.blockByMhKey);

  // Decode the header data.
  const header = EthDecoder.decodeHeader(EthDecoder.decodeData(fullBlock.blockByMhKey.data));
  assert(header);

  // TODO: Calculate size from rlp encoded data.
  // Get block info from JSON RPC API provided by ipld-eth-server.
  const provider = ethProvider as providers.JsonRpcProvider;
  const size = await getCachedBlockSize(provider, blockHash, Number(fullBlock.blockNumber));

  return {
    headerId: fullBlock.id,
    cid: fullBlock.cid,
    blockNumber: fullBlock.blockNumber,
    blockHash: fullBlock.blockHash,
    parentHash: fullBlock.parentHash,
    timestamp: fullBlock.timestamp,
    stateRoot: fullBlock.stateRoot,
    td: fullBlock.td,
    txRoot: fullBlock.txRoot,
    receiptRoot: fullBlock.receiptRoot,
    uncleHash: fullBlock.uncleRoot,
    difficulty: header.Difficulty.toString(),
    gasLimit: header.GasLimit.toString(),
    gasUsed: header.GasUsed.toString(),
    author: header.Beneficiary,
    size: BigInt(size).toString(),
    baseFee: header.BaseFee?.toString()
  };
};

export const getFullTransaction = async (ethClient: EthClient, txHash: string): Promise<any> => {
  const {
    ethTransactionCidByTxHash: fullTx
  } = await ethClient.getFullTransaction(txHash);

  assert(fullTx.blockByMhKey);

  // Decode the transaction data.
  const txData = utils.parseTransaction(EthDecoder.decodeData(fullTx.blockByMhKey.data));
  assert(txData);

  return {
    hash: txHash,
    from: fullTx.src,
    to: fullTx.dst,
    index: fullTx.index,
    value: txData.value.toString(),
    gasLimit: txData.gasLimit.toString(),
    gasPrice: txData.gasPrice?.toString(),
    input: txData.data,
    maxPriorityFeePerGas: txData.maxPriorityFeePerGas?.toString(),
    maxFeePerGas: txData.maxFeePerGas?.toString()
  };
};

export const jsonBigIntStringReplacer = (_: string, value: any): any => {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  return value;
};
