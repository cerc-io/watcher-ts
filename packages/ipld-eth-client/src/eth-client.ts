import assert from 'assert';
import _ from 'lodash';

import { Cache } from '@vulcanize/cache';

import ethQueries from './eth-queries';
import { padKey } from './utils';
import { GraphQLClient, GraphQLConfig } from './graphql-client';

interface Config extends GraphQLConfig {
  cache: Cache | undefined;
}

interface Vars {
  blockHash: string;
  contract?: string;
  slot?: string;
}

export class EthClient {
  _config: Config;
  _graphqlClient: GraphQLClient;
  _cache: Cache | undefined;

  constructor (config: Config) {
    this._config = config;

    const { gqlEndpoint, gqlSubscriptionEndpoint, cache } = config;

    assert(gqlEndpoint, 'Missing gql endpoint');
    assert(gqlSubscriptionEndpoint, 'Missing gql subscription endpoint');

    this._graphqlClient = new GraphQLClient({ gqlEndpoint, gqlSubscriptionEndpoint });

    this._cache = cache;
  }

  async getStorageAt ({ blockHash, contract, slot }: { blockHash: string, contract: string, slot: string }): Promise<{ value: string, proof: { data: string } }> {
    slot = `0x${padKey(slot)}`;

    const result = await this._getCachedOrFetch('getStorageAt', { blockHash, contract, slot });
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

  async getBlockWithTransactions (blockNumber: string): Promise<any> {
    return this._graphqlClient.query(ethQueries.getBlockWithTransactions, { blockNumber });
  }

  async getLogs (vars: Vars): Promise<any> {
    const result = await this._getCachedOrFetch('getLogs', vars);
    const {
      getLogs: resultLogs,
      block: {
        number: blockNumHex,
        timestamp: timestampHex,
        parent: {
          hash: parentHash
        }
      }
    } = result;

    const block = {
      hash: vars.blockHash,
      number: parseInt(blockNumHex, 16),
      timestamp: parseInt(timestampHex, 16),
      parent: {
        hash: parentHash
      }
    };

    const logs = resultLogs.map((logEntry: any) => _.merge({}, logEntry, { transaction: { block } }));

    return { logs, block };
  }

  async watchBlocks (onNext: (value: any) => void): Promise<ZenObservable.Subscription> {
    return this._graphqlClient.subscribe(ethQueries.subscribeBlocks, onNext);
  }

  async watchLogs (onNext: (value: any) => void): Promise<ZenObservable.Subscription> {
    return this._graphqlClient.subscribe(ethQueries.subscribeLogs, onNext);
  }

  async watchTransactions (onNext: (value: any) => void): Promise<ZenObservable.Subscription> {
    return this._graphqlClient.subscribe(ethQueries.subscribeTransactions, onNext);
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
