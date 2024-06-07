//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { ValueTransformer } from 'typeorm';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { utils, providers, errors as ethersErrors } from 'ethers';
import JSONbig from 'json-bigint';
import Decimal from 'decimal.js';
import ApolloBigInt from 'apollo-type-bigint';
import { GraphQLResolveInfo, GraphQLScalarType, ValueNode } from 'graphql';
import _ from 'lodash';

import { DEFAULT_CONFIG_PATH } from './constants';
import { GQLCacheConfig, Config } from './config';
import { JobQueue } from './job-queue';
import { GraphDecimal } from './graph/graph-decimal';
import * as EthDecoder from './eth';
import { ResultEvent } from './indexer';
import { EventInterface, EthFullBlock, EthFullTransaction } from './types';
import { BlockHeight } from './database';
import { Transaction } from './graph/utils';
import { ethRpcErrors, ethRpcRequestDuration } from './metrics';

const JSONbigNative = JSONbig({ useNativeBigInt: true });

export const FUTURE_BLOCK_ERROR = "requested a future epoch (beyond 'latest')";
export const NULL_BLOCK_ERROR = 'requested epoch was a null round';

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
    if (value !== undefined && value !== null) {
      return value.toFixed();
    }

    return value;
  },
  from: (value?: string) => {
    if (value !== undefined && value !== null) {
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
    if (value !== undefined && value !== null) {
      return value.toString();
    }

    return value;
  },
  from: (value?: string) => {
    if (value !== undefined && value !== null) {
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
    if (value !== undefined && value !== null) {
      return value.toString();
    }

    return value;
  },
  from: (value?: string) => {
    if (value !== undefined && value !== null) {
      return BigInt(value);
    }

    return value;
  }
};

export const bigintArrayTransformer: ValueTransformer = {
  to: (valueArray?: bigint[]) => {
    if (valueArray !== undefined) {
      return valueArray.map(value => bigintTransformer.to(value));
    }

    return valueArray;
  },
  from: (valueArray?: string[]) => {
    if (valueArray !== undefined) {
      return valueArray.map(value => bigintTransformer.from(value));
    }

    return valueArray;
  }
};

export const decimalArrayTransformer: ValueTransformer = {
  to: (valueArray?: Decimal[]) => {
    if (valueArray !== undefined) {
      return valueArray.map(value => decimalTransformer.to(value));
    }

    return valueArray;
  },
  from: (valueArray?: string[]) => {
    if (valueArray !== undefined) {
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
  // Delete all active and pending (before completed) jobs
  await jobQueue.deleteAllJobs('completed');
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
  const provider = new MonitoredStaticJsonRpcProvider(url, network);
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

export const getFullBlock = (ethFullBlock: EthFullBlock): any => {
  // Decode the header data.
  const header = EthDecoder.decodeHeader(EthDecoder.decodeData(ethFullBlock.blockByMhKey.data));
  assert(header);

  return {
    headerId: ethFullBlock.id,
    cid: ethFullBlock.cid,
    blockNumber: ethFullBlock.blockNumber,
    blockHash: ethFullBlock.blockHash,
    parentHash: ethFullBlock.parentHash,
    timestamp: ethFullBlock.timestamp,
    stateRoot: ethFullBlock.stateRoot,
    td: ethFullBlock.td,
    txRoot: ethFullBlock.txRoot,
    receiptRoot: ethFullBlock.receiptRoot,
    uncleHash: ethFullBlock.uncleRoot,
    difficulty: header.Difficulty.toString(),
    gasLimit: header.GasLimit.toString(),
    gasUsed: header.GasUsed.toString(),
    author: header.Beneficiary,
    size: ethFullBlock.size,
    baseFee: header.BaseFee?.toString()
  };
};

export const getFullTransaction = (txHash: string, ethFullTransactions: EthFullTransaction[]): Transaction => {
  const ethFullTransaction = ethFullTransactions.find(ethFullTransaction => ethFullTransaction.ethTransactionCidByTxHash.txHash === txHash);
  assert(ethFullTransaction);

  let {
    ethTransactionCidByTxHash: fullTx,
    data: txData
  } = ethFullTransaction;

  // Check if txData does not exist when using ipld-eth-client
  if (!txData) {
    assert(fullTx.blockByMhKey);

    // Decode the transaction data.
    // TODO: Get required tx data directly from ipld-eth-server
    txData = utils.parseTransaction(EthDecoder.decodeData(fullTx.blockByMhKey.data));
  }

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

export const getResultEvent = (event: EventInterface): ResultEvent => {
  const block = event.block;
  const { logIndex, ...eventFields } = JSONbigNative.parse(event.eventInfo);
  const { tx, eventSignature } = JSONbigNative.parse(event.extraInfo);

  return {
    block: {
      cid: block.cid,
      hash: block.blockHash,
      number: block.blockNumber,
      timestamp: block.blockTimestamp,
      parentHash: block.parentHash
    },

    tx: {
      hash: event.txHash,
      from: tx.src,
      to: tx.dst,
      index: tx.index
    },

    contract: event.contract,

    eventIndex: logIndex ?? event.index,
    eventSignature,
    event: {
      __typename: `${event.eventName}Event`,
      ...eventFields
    },

    // TODO: Return proof only if requested.
    proof: JSON.parse(event.proof)
  };
};

export const setGQLCacheHints = (info: GraphQLResolveInfo, block: BlockHeight, gqlCache: GQLCacheConfig): void => {
  if (!gqlCache || !gqlCache.enabled) {
    return;
  }

  let maxAge: number;
  if (_.isEmpty(block)) {
    assert(gqlCache.maxAge, 'Missing server gqlCache.maxAge');
    maxAge = gqlCache.maxAge;
  } else {
    assert(gqlCache.timeTravelMaxAge, 'Missing server gqlCache.timeTravelMaxAge');
    maxAge = gqlCache.timeTravelMaxAge;
  }

  info.cacheControl.setCacheHint({ maxAge });
};

class GraphQLBigIntType extends ApolloBigInt {
  constructor () {
    super('bigInt');
  }

  name = 'BigInt';
  description = 'BigInt custom scalar type';

  parseLiteral = function (ast: ValueNode) {
    if (ast.kind === 'IntValue' || ast.kind === 'StringValue') {
      return global.BigInt(ast.value);
    } else {
      throw new TypeError(`BigInt cannot represent value kind: ${ast.kind}`);
    }
  };

  parseValue = function (value: any) {
    if (value === '') {
      throw new TypeError('The value cannot be converted from BigInt because it is empty string');
    }

    if (typeof value !== 'number' && typeof value !== 'bigint' && typeof value !== 'string') {
      throw new TypeError(
        `The value ${value} cannot be converted to a BigInt because it is not an integer`
      );
    }

    try {
      return global.BigInt(value);
    } catch {
      throw new TypeError(
        `The value ${value} cannot be converted to a BigInt because it is not an integer`
      );
    }
  };
}

export const GraphQLBigInt = new GraphQLBigIntType();

export const GraphQLBigDecimal = new GraphQLScalarType({
  name: 'BigDecimal',
  description: 'BigDecimal custom scalar type',
  parseValue (value) {
    // value from the client
    return new Decimal(value);
  },
  serialize (value: Decimal) {
    // value sent to the client
    return value.toFixed();
  }
});

export class MonitoredStaticJsonRpcProvider extends providers.StaticJsonRpcProvider {
  // Override the send method
  async send (method: string, params: Array<any>): Promise<any> {
    // Register time taken for this request in the metrics
    const endTimer = ethRpcRequestDuration.startTimer({ method, provider: this.connection.url });

    try {
      const result = await super.send(method, params);
      return result;
    } catch (err: any) {
      // Ignore errors on fetching future blocks and if block is null (in case of filecoin)
      if (err.code === ethersErrors.SERVER_ERROR && err.error) {
        if (err.error.message === FUTURE_BLOCK_ERROR || err.error.message === NULL_BLOCK_ERROR) {
          throw err;
        }
      }

      // Register the error in metrics
      ethRpcErrors.inc({ method, provider: this.connection.url }, 1);

      // Rethrow the error
      throw err;
    } finally {
      endTimer();
    }
  }
}
