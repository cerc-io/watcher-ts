//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { providers, utils } from 'ethers';
import { TransactionReceipt } from '@ethersproject/abstract-provider';

import { Cache } from '@cerc-io/cache';
import { encodeHeader, escapeHexString } from '@cerc-io/util';

import { padKey } from './utils';

export interface Config {
  cache: Cache | undefined;
  rpcEndpoint: string;
}

interface Vars {
  blockHash: string;
  blockNumber?: string;
  contract?: string;
  slot?: string;
  addresses?: string[];
}

export class EthClient {
  _provider: providers.JsonRpcProvider;
  _cache: Cache | undefined;

  constructor (config: Config) {
    const { rpcEndpoint, cache } = config;
    assert(rpcEndpoint, 'Missing RPC endpoint');
    this._provider = new providers.JsonRpcProvider(rpcEndpoint);

    this._cache = cache;
  }

  async getStorageAt ({ blockHash, contract, slot }: { blockHash: string, contract: string, slot: string }): Promise<{ value: string }> {
    slot = `0x${padKey(slot)}`;

    console.time(`time:eth-client#getStorageAt-${JSON.stringify({ blockHash, contract, slot })}`);
    const value = await this._getCachedOrFetch(
      'getStorageAt',
      { blockHash, contract, slot },
      async () => {
        // TODO: Check if blockHash works with Lotus RPC
        return this._provider.getStorageAt(contract, slot, blockHash);
      }
    );
    console.timeEnd(`time:eth-client#getStorageAt-${JSON.stringify({ blockHash, contract, slot })}`);

    // TODO: Return proof with cid and ipldBlock
    return {
      value
    };
  }

  async getBlockWithTransactions ({ blockNumber, blockHash }: { blockNumber?: number, blockHash?: string }): Promise<any> {
    const blockHashOrBlockNumber = blockHash ?? blockNumber;
    assert(blockHashOrBlockNumber);
    console.time(`time:eth-client#getBlockWithTransactions-${JSON.stringify({ blockNumber, blockHash })}`);
    const result = await this._provider.getBlockWithTransactions(blockHashOrBlockNumber);
    console.timeEnd(`time:eth-client#getBlockWithTransactions-${JSON.stringify({ blockNumber, blockHash })}`);

    const allEthHeaderCids = {
      nodes: [
        {
          blockNumber: result.number.toString(),
          blockHash: result.hash,
          parentHash: result.parentHash,
          timestamp: result.timestamp.toString(),
          ethTransactionCidsByHeaderId: {
            nodes: result.transactions.map((transaction) => ({
              txHash: transaction.hash,
              // Transactions with block should be of type TransactionReceipt
              index: (transaction as unknown as TransactionReceipt).transactionIndex,
              src: transaction.from,
              dst: transaction.to
            }))
          }
        }
      ]
    };

    return { allEthHeaderCids };
  }

  async getBlocks ({ blockNumber, blockHash }: { blockNumber?: number, blockHash?: string }): Promise<any> {
    const blockHashOrBlockNumber = blockHash ?? blockNumber;
    assert(blockHashOrBlockNumber);
    console.time(`time:eth-client#getBlocks-${JSON.stringify({ blockNumber, blockHash })}`);
    const rawBlock = await this._provider.send(
      blockHash ? 'eth_getBlockByHash' : 'eth_getBlockByNumber',
      [utils.hexValue(blockHashOrBlockNumber), false]
    );
    console.timeEnd(`time:eth-client#getBlocks-${JSON.stringify({ blockNumber, blockHash })}`);

    const block = this._provider.formatter.block(rawBlock);

    const allEthHeaderCids = {
      nodes: [
        {
          blockNumber: block.number.toString(),
          blockHash: block.hash,
          parentHash: block.parentHash,
          timestamp: block.timestamp.toString(),
          stateRoot: this._provider.formatter.hash(rawBlock.stateRoot),
          td: this._provider.formatter.bigNumber(rawBlock.totalDifficulty).toString(),
          txRoot: this._provider.formatter.hash(rawBlock.transactionsRoot),
          receiptRoot: this._provider.formatter.hash(rawBlock.receiptsRoot)
        }
      ]
    };

    return { allEthHeaderCids };
  }

  // Used in uniswap
  async getFullBlocks ({ blockNumber, blockHash }: { blockNumber?: number, blockHash?: string }): Promise<any> {
    const blockHashOrBlockNumber = blockHash ?? blockNumber;
    assert(blockHashOrBlockNumber);

    console.time(`time:eth-client#getFullBlocks-${JSON.stringify({ blockNumber, blockHash })}`);
    const rawBlock = await this._provider.send(
      blockHash ? 'eth_getBlockByHash' : 'eth_getBlockByNumber',
      [utils.hexValue(blockHashOrBlockNumber), false]
    );
    console.timeEnd(`time:eth-client#getFullBlocks-${JSON.stringify({ blockNumber, blockHash })}`);

    // Create block header
    // https://github.com/cerc-io/go-ethereum/blob/v1.11.6-statediff-5.0.8/core/types/block.go#L64
    const header = {
      Parent: rawBlock.parentHash,
      UnclesDigest: rawBlock.sha3Uncles,
      Beneficiary: rawBlock.miner,
      StateRoot: rawBlock.stateRoot,
      TxRoot: rawBlock.transactionsRoot,
      RctRoot: rawBlock.receiptsRoot,
      Bloom: rawBlock.logsBloom,
      Difficulty: BigInt(rawBlock.difficulty),
      Number: BigInt(rawBlock.number),
      GasLimit: BigInt(rawBlock.gasLimit),
      GasUsed: BigInt(rawBlock.gasUsed),
      Time: Number(rawBlock.timestamp),
      Extra: rawBlock.extraData,
      MixDigest: rawBlock.mixHash,
      Nonce: BigInt(rawBlock.nonce),
      BaseFee: rawBlock.baseFeePerGas
    };

    const rlpData = encodeHeader(header);

    const allEthHeaderCids = {
      nodes: [
        {
          blockNumber: this._provider.formatter.number(rawBlock.number).toString(),
          blockHash: this._provider.formatter.hash(rawBlock.hash),
          parentHash: this._provider.formatter.hash(rawBlock.parentHash),
          timestamp: this._provider.formatter.number(rawBlock.timestamp).toString(),
          stateRoot: this._provider.formatter.hash(rawBlock.stateRoot),
          td: this._provider.formatter.bigNumber(rawBlock.totalDifficulty).toString(),
          txRoot: this._provider.formatter.hash(rawBlock.transactionsRoot),
          receiptRoot: this._provider.formatter.hash(rawBlock.receiptsRoot),
          uncleRoot: this._provider.formatter.hash(rawBlock.sha3Uncles),
          bloom: escapeHexString(this._provider.formatter.hex(rawBlock.logsBloom)),
          blockByMhKey: {
            data: escapeHexString(rlpData)
          }
        }
      ]
    };

    return { allEthHeaderCids };
  }

  // Used in uniswap
  async getFullTransaction (txHash: string, blockNumber?: number): Promise<any> {
    console.time(`time:eth-client#getFullTransaction-${JSON.stringify({ txHash, blockNumber })}`);
    // const result = this._graphqlClient.query(
    //   ethQueries.getFullTransaction,
    //   {
    //     txHash,
    //     blockNumber: blockNumber?.toString()
    //   }
    // );
    console.timeEnd(`time:eth-client#getFullTransaction-${JSON.stringify({ txHash, blockNumber })}`);

    return {};
  }

  // Used in uniswap
  async getBlockByHash (blockHash?: string): Promise<any> {
    console.time(`time:eth-client#getBlockByHash-${blockHash}`);
    // const result = await this._graphqlClient.query(ethQueries.getBlockByHash, { blockHash });
    console.timeEnd(`time:eth-client#getBlockByHash-${blockHash}`);

    return {
      block: {
        // ...result.block,
        // number: parseInt(result.block.number, 16),
        // timestamp: parseInt(result.block.timestamp, 16)
      }
    };
  }

  // Used in uniswap
  async getLogs (vars: Vars): Promise<any> {
    console.time(`time:eth-client#getLogs-${JSON.stringify(vars)}`);
    // const result = await this._getCachedOrFetch('getLogs', vars);
    console.timeEnd(`time:eth-client#getLogs-${JSON.stringify(vars)}`);
    // const {
    //   getLogs
    // } = result;

    return {
      // logs: getLogs
    };
  }

  async _getCachedOrFetch (queryName: string, vars: Vars, fetch: () => Promise<any>): Promise<any> {
    const keyObj = {
      queryName,
      vars
    };

    // Check if request cached in db, if cache is enabled.
    if (this._cache) {
      const [value, found] = await this._cache.get(keyObj) || [undefined, false];
      if (found) {
        return value;
      }
    }

    // Result not cached or cache disabled, need to perform fetch.
    const result = await fetch();

    // Cache the result and return it, if cache is enabled.
    if (this._cache) {
      await this._cache.put(keyObj, result);
    }

    return result;
  }
}
