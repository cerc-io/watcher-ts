import assert from 'assert';
import { GraphQLClient } from 'graphql-request';

import { Cache } from '@vulcanize/cache';

import ethQueries from './eth-queries';

export class EthClient {

  _config: any;
  _client: any;
  _cache: Cache;

  constructor(config) {
    this._config = config;

    const { gqlEndpoint, cache } = config;
    assert(gqlEndpoint, 'Missing gql endpoint');

    this._client = new GraphQLClient(gqlEndpoint);
    this._cache = cache;
  }

  async getStorageAt(vars) {
    const result = await this._getCachedOrFetch('getStorageAt', vars);
    const { getStorageAt: { value, cid, ipldBlock } } = result;

    return { value, cid, ipldBlock };
  }

  async getLogs(vars) {
    const result = await this._getCachedOrFetch('getLogs', vars);
    const { getLogs: logs } = result;

    return logs;
  }

  async _getCachedOrFetch(queryName, vars) {
    const keyObj = {
      queryName,
      vars
    };

    // Check if request cached in db, if cache is enabled.
    if (this._cache) {
      const [value, found] = await this._cache.get(keyObj);
      if (found) {
        return value;
      }
    }

    // Not cached or cache disabled, need to perform an upstream GQL query.
    const result = await this._client.request(ethQueries[queryName], vars);

    // Cache the result and return it, if cache is enabled.
    if (this._cache) {
      await this._cache.put(keyObj, result);
    }

    return result;
  }
}
