//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { providers } from 'ethers';

import { Cache } from '@cerc-io/cache';

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
  _provider: providers.Provider;
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
    console.time(`time:eth-client#getBlockWithTransactions-${JSON.stringify({ blockNumber, blockHash })}`);
    // const result = await this._graphqlClient.query(
    //   ethQueries.getBlockWithTransactions,
    //   {
    //     blockNumber: blockNumber?.toString(),
    //     blockHash
    //   }
    // );
    console.timeEnd(`time:eth-client#getBlockWithTransactions-${JSON.stringify({ blockNumber, blockHash })}`);

    return {};
  }

  async getBlocks ({ blockNumber, blockHash }: { blockNumber?: number, blockHash?: string }): Promise<any> {
    console.time(`time:eth-client#getBlocks-${JSON.stringify({ blockNumber, blockHash })}`);
    // const result = await this._graphqlClient.query(
    //   ethQueries.getBlocks,
    //   {
    //     blockNumber: blockNumber?.toString(),
    //     blockHash
    //   }
    // );
    console.timeEnd(`time:eth-client#getBlocks-${JSON.stringify({ blockNumber, blockHash })}`);

    return {};
  }

  async getFullBlocks ({ blockNumber, blockHash }: { blockNumber?: number, blockHash?: string }): Promise<any> {
    console.time(`time:eth-client#getFullBlocks-${JSON.stringify({ blockNumber, blockHash })}`);
    // const result = await this._graphqlClient.query(
    //   ethQueries.getFullBlocks,
    //   {
    //     blockNumber: blockNumber?.toString(),
    //     blockHash
    //   }
    // );
    console.timeEnd(`time:eth-client#getFullBlocks-${JSON.stringify({ blockNumber, blockHash })}`);

    return {};
  }

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
