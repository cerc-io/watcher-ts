//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { errors, providers, utils } from 'ethers';

import { Cache } from '@cerc-io/cache';
import { encodeHeader, escapeHexString, EthClient as EthClientInterface, EthFullTransaction } from '@cerc-io/util';
import { padKey } from '@cerc-io/ipld-eth-client';

export interface Config {
  cache: Cache | undefined;
  rpcEndpoint: string;
}

interface Vars {
  blockHash?: string;
  blockNumber?: string;
  contract?: string;
  slot?: string;
  addresses?: string[];
  topics?: string[][];
  fromBlock?: number;
  toBlock?: number;
}

export class EthClient implements EthClientInterface {
  _provider: providers.JsonRpcProvider;
  _cache: Cache | undefined;

  constructor (config: Config) {
    const { rpcEndpoint, cache } = config;
    assert(rpcEndpoint, 'Missing RPC endpoint');
    this._provider = new providers.StaticJsonRpcProvider({
      url: rpcEndpoint,
      allowGzip: true
    });

    this._cache = cache;
  }

  async getStorageAt ({ blockHash, contract, slot }: { blockHash: string, contract: string, slot: string }): Promise<{ value: string, proof: { data: string } }> {
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

    return {
      value,
      proof: {
        // TODO: Return proof with cid and ipldBlock
        // To match getStorageAt method of ipld-eth-client which returns proof along with value.
        data: JSON.stringify(null)
      }
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
              index: (transaction as unknown as providers.TransactionReceipt).transactionIndex,
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
    const blockNumberHex = blockNumber ? utils.hexValue(blockNumber) : undefined;
    const blockHashOrBlockNumber = blockHash ?? blockNumberHex;
    assert(blockHashOrBlockNumber);
    let nodes: any[] = [];
    console.time(`time:eth-client#getBlocks-${JSON.stringify({ blockNumber, blockHash })}`);

    try {
      const rawBlock = await this._provider.send(
        blockHash ? 'eth_getBlockByHash' : 'eth_getBlockByNumber',
        [blockHashOrBlockNumber, false]
      );

      if (rawBlock) {
        const block = this._provider.formatter.block(rawBlock);

        nodes = [
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
        ];
      }
    } catch (err: any) {
      // Check and ignore future block error
      if (!(err.code === errors.SERVER_ERROR && err.error && err.error.message === "requested a future epoch (beyond 'latest')")) {
        throw err;
      }
    } finally {
      console.timeEnd(`time:eth-client#getBlocks-${JSON.stringify({ blockNumber, blockHash })}`);
    }

    return {
      allEthHeaderCids: {
        nodes
      }
    };
  }

  async getFullBlocks ({ blockNumber, blockHash }: { blockNumber?: number, blockHash?: string }): Promise<any> {
    const blockNumberHex = blockNumber ? utils.hexValue(blockNumber) : undefined;
    const blockHashOrBlockNumber = blockHash ?? blockNumberHex;
    assert(blockHashOrBlockNumber);

    console.time(`time:eth-client#getFullBlocks-${JSON.stringify({ blockNumber, blockHash })}`);
    const rawBlock = await this._provider.send(
      blockHash ? 'eth_getBlockByHash' : 'eth_getBlockByNumber',
      [blockHashOrBlockNumber, false]
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
      BaseFee: rawBlock.baseFeePerGas && BigInt(rawBlock.baseFeePerGas)
    };

    const rlpData = encodeHeader(header);

    return [{
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
      size: this._provider.formatter.number(rawBlock.size).toString(),
      blockByMhKey: {
        data: escapeHexString(rlpData)
      }
    }];
  }

  async getFullTransaction (txHash: string): Promise<EthFullTransaction> {
    console.time(`time:eth-client#getFullTransaction-${JSON.stringify({ txHash })}`);
    const tx = await this._provider.getTransaction(txHash);
    console.timeEnd(`time:eth-client#getFullTransaction-${JSON.stringify({ txHash })}`);

    return {
      ethTransactionCidByTxHash: {
        txHash: tx.hash,
        index: (tx as any).transactionIndex,
        src: tx.from,
        dst: tx.to
      },
      data: tx
    };
  }

  async getBlockByHash (blockHash?: string): Promise<any> {
    const blockTag: providers.BlockTag = blockHash ?? 'latest';

    console.time(`time:eth-client#getBlockByHash-${blockHash}`);
    const block = await this._provider.getBlock(blockTag);
    console.timeEnd(`time:eth-client#getBlockByHash-${blockHash}`);

    return {
      block: {
        number: block.number,
        hash: block.hash,
        parent: {
          hash: block.parentHash
        },
        timestamp: block.timestamp
      }
    };
  }

  async getLogs (vars: {
    blockHash: string,
    blockNumber: string,
    addresses?: string[],
    topics?: string[][]
  }): Promise<any> {
    console.time(`time:eth-client#getLogs-${JSON.stringify(vars)}`);
    const result = await this._getLogs({
      blockHash: vars.blockHash,
      addresses: vars.addresses,
      topics: vars.topics
    });
    console.timeEnd(`time:eth-client#getLogs-${JSON.stringify(vars)}`);

    return result;
  }

  async getLogsForBlockRange (vars: {
    fromBlock?: number,
    toBlock?: number,
    addresses?: string[],
    topics?: string[][]
  }): Promise<any> {
    console.time(`time:eth-client#getLogsForBlockRange-${JSON.stringify(vars)}`);
    const result = await this._getLogs({
      fromBlock: Number(vars.fromBlock),
      toBlock: Number(vars.toBlock),
      addresses: vars.addresses,
      topics: vars.topics
    });
    console.timeEnd(`time:eth-client#getLogsForBlockRange-${JSON.stringify(vars)}`);

    return result;
  }

  // TODO: Implement return type
  async _getLogs (vars: {
    blockHash?: string,
    fromBlock?: number,
    toBlock?: number,
    addresses?: string[],
    topics?: string[][]
  }): Promise<any> {
    const { blockHash, fromBlock, toBlock, addresses = [], topics } = vars;

    const result = await this._getCachedOrFetch(
      'getLogs',
      vars,
      async () => {
        const ethLogs = await this._provider.send(
          'eth_getLogs',
          [{
            address: addresses.map(address => address.toLowerCase()),
            fromBlock: fromBlock && utils.hexValue(fromBlock),
            toBlock: toBlock && utils.hexValue(toBlock),
            blockHash,
            topics
          }]
        );

        // Format raw eth_getLogs response
        const logs: providers.Log[] = providers.Formatter.arrayOf(
          this._provider.formatter.filterLog.bind(this._provider.formatter)
        )(ethLogs);

        return logs.map((log) => {
          log.address = log.address.toLowerCase();
          return log;
        });
      }
    );

    const txHashesSet = result.reduce((acc, log) => {
      acc.add(log.transactionHash);
      return acc;
    }, new Set<string>());

    const txReceipts = await Promise.all(Array.from(txHashesSet).map(txHash => this._provider.getTransactionReceipt(txHash)));

    const txReceiptMap = txReceipts.reduce((acc, txReceipt) => {
      acc.set(txReceipt.transactionHash, txReceipt);
      return acc;
    }, new Map<string, providers.TransactionReceipt>());

    return {
      logs: result.map((log) => ({
        // blockHash required for sorting logs fetched in a block range
        blockHash: log.blockHash,
        account: {
          address: log.address
        },
        transaction: {
          hash: log.transactionHash
        },
        topics: log.topics,
        data: log.data,
        index: log.logIndex,
        status: txReceiptMap.get(log.transactionHash)?.status
      }))
    };
  }

  async _getCachedOrFetch<Result> (queryName: string, vars: Vars, fetch: () => Promise<Result>): Promise<Result> {
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
