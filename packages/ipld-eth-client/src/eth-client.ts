//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';

import { Cache } from '@cerc-io/cache';

import ethQueries from './eth-queries';
import { padKey } from './utils';
import { GraphQLClient, GraphQLConfig } from './graphql-client';

export interface Config extends GraphQLConfig {
  cache: Cache | undefined;
}

interface Vars {
  blockHash: string;
  blockNumber?: string;
  contract?: string;
  slot?: string;
  addresses?: string[];
}

export class EthClient {
  _config: Config;
  _graphqlClient: GraphQLClient;
  _cache: Cache | undefined;

  constructor (config: Config) {
    this._config = config;

    const { gqlEndpoint, gqlSubscriptionEndpoint, cache } = config;

    assert(gqlEndpoint, 'Missing gql endpoint');

    this._graphqlClient = new GraphQLClient({ gqlEndpoint, gqlSubscriptionEndpoint });

    this._cache = cache;
  }

  async getStorageAt ({ blockHash, contract, slot }: { blockHash: string, contract: string, slot: string }): Promise<{ value: string, proof: { data: string } }> {
    slot = `0x${padKey(slot)}`;

    console.time(`time:eth-client#getStorageAt-${JSON.stringify({ blockHash, contract, slot })}`);
    const result = await this._getCachedOrFetch('getStorageAt', { blockHash, contract, slot });
    console.timeEnd(`time:eth-client#getStorageAt-${JSON.stringify({ blockHash, contract, slot })}`);
    const { getStorageAt: { value, cid, ipldBlock } } = result;

    return {
      value,
      proof: {
        // TODO: Return proof only if requested.
        data: JSON.stringify({
          blockHash,
          account: {
            address: contract,
            storage: {
              cid,
              ipldBlock
            }
          }
        })
      }
    };
  }

  async getBlockWithTransactions ({ blockNumber, blockHash }: { blockNumber?: number, blockHash?: string }): Promise<any> {
    console.time(`time:eth-client#getBlockWithTransactions-${JSON.stringify({ blockNumber, blockHash })}`);
    const result = await this._graphqlClient.query(
      ethQueries.getBlockWithTransactions,
      {
        blockNumber: blockNumber?.toString(),
        blockHash
      }
    );
    console.timeEnd(`time:eth-client#getBlockWithTransactions-${JSON.stringify({ blockNumber, blockHash })}`);

    return result;
  }

  async getBlocks ({ blockNumber, blockHash }: { blockNumber?: number, blockHash?: string }): Promise<any> {
    console.time(`time:eth-client#getBlocks-${JSON.stringify({ blockNumber, blockHash })}`);
    const result = await this._graphqlClient.query(
      ethQueries.getBlocks,
      {
        blockNumber: blockNumber?.toString(),
        blockHash
      }
    );
    console.timeEnd(`time:eth-client#getBlocks-${JSON.stringify({ blockNumber, blockHash })}`);

    return result;
  }

  async getFullBlocks ({ blockNumber, blockHash }: { blockNumber?: number, blockHash?: string }): Promise<any> {
    console.time(`time:eth-client#getFullBlocks-${JSON.stringify({ blockNumber, blockHash })}`);
    const result = await this._graphqlClient.query(
      ethQueries.getFullBlocks,
      {
        blockNumber: blockNumber?.toString(),
        blockHash
      }
    );
    console.timeEnd(`time:eth-client#getFullBlocks-${JSON.stringify({ blockNumber, blockHash })}`);

    return result;
  }

  async getFullTransaction (txHash: string, blockNumber?: number): Promise<any> {
    console.time(`time:eth-client#getFullTransaction-${JSON.stringify({ txHash, blockNumber })}`);
    const result = this._graphqlClient.query(
      ethQueries.getFullTransaction,
      {
        txHash,
        blockNumber: blockNumber?.toString()
      }
    );
    console.timeEnd(`time:eth-client#getFullTransaction-${JSON.stringify({ txHash, blockNumber })}`);

    return result;
  }

  async getBlockByHash (blockHash?: string): Promise<any> {
    console.time(`time:eth-client#getBlockByHash-${blockHash}`);
    const result = await this._graphqlClient.query(ethQueries.getBlockByHash, { blockHash });
    console.timeEnd(`time:eth-client#getBlockByHash-${blockHash}`);

    return {
      block: {
        ...result.block,
        number: parseInt(result.block.number, 16),
        timestamp: parseInt(result.block.timestamp, 16)
      }
    };
  }

  async getLogs (vars: Vars): Promise<any> {
    console.time(`time:eth-client#getLogs-${JSON.stringify(vars)}`);
    const result = await this._getCachedOrFetch('getLogs', vars);
    console.timeEnd(`time:eth-client#getLogs-${JSON.stringify(vars)}`);
    const {
      getLogs
    } = result;

    return { logs: getLogs };
  }

  async _getCachedOrFetch (queryName: keyof typeof ethQueries, vars: Vars): Promise<any> {
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

    // Result not cached or cache disabled, need to perform an upstream GQL query.
    const result = await this._graphqlClient.query(ethQueries[queryName], vars);

    // Cache the result and return it, if cache is enabled.
    if (this._cache) {
      await this._cache.put(keyObj, result);
    }

    return result;
  }
}
