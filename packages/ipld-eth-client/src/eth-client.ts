import assert from 'assert';
import debug from 'debug';
import fetch from 'cross-fetch';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import ws from 'ws';

import { ApolloClient, NormalizedCacheObject, split, HttpLink, InMemoryCache } from '@apollo/client/core';
import { getMainDefinition } from '@apollo/client/utilities';
import { WebSocketLink } from '@apollo/client/link/ws';
import { Cache } from '@vulcanize/cache';

import ethQueries from './eth-queries';
import { padKey } from './utils';

const log = debug('vulcanize:eth-client');

interface Config {
  gqlEndpoint: string;
  gqlSubscriptionEndpoint: string;
  cache: Cache | undefined;
}

interface Vars {
  blockHash: string;
  contract: string;
  slot?: string;
}

export class EthClient {
  _config: Config;
  _client: ApolloClient<NormalizedCacheObject>;
  _cache: Cache | undefined;

  constructor (config: Config) {
    this._config = config;

    const { gqlEndpoint, gqlSubscriptionEndpoint, cache } = config;

    assert(gqlEndpoint, 'Missing gql endpoint');
    assert(gqlSubscriptionEndpoint, 'Missing gql subscription endpoint');

    // https://www.apollographql.com/docs/react/data/subscriptions/
    const subscriptionClient = new SubscriptionClient(gqlSubscriptionEndpoint, {
      reconnect: true,
      connectionCallback: (error: Error[]) => {
        if (error) {
          log('Subscription client connection error', error[0].message);
        } else {
          log('Subscription client connected successfully');
        }
      }
    }, ws);

    subscriptionClient.onError(error => {
      log('Subscription client error', error.message);
    });

    const httpLink = new HttpLink({
      uri: gqlEndpoint,
      fetch
    });

    const wsLink = new WebSocketLink(subscriptionClient);

    const splitLink = split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return (
          definition.kind === 'OperationDefinition' &&
          definition.operation === 'subscription'
        );
      },
      wsLink,
      httpLink
    );

    this._client = new ApolloClient({
      link: splitLink,
      cache: new InMemoryCache()
    });

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

  async getLogs (vars: Vars): Promise<any> {
    const result = await this._getCachedOrFetch('getLogs', vars);
    const { getLogs: logs } = result;

    return logs;
  }

  async watchLogs (onNext: (value: any) => void): Promise<ZenObservable.Subscription> {
    const observable = await this._client.subscribe({
      query: ethQueries.subscribeLogs
    });

    return observable.subscribe({
      next (data) {
        onNext(data);
      }
    });
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
    const { data: result } = await this._client.query({ query: ethQueries[queryName], variables: vars });

    // Cache the result and return it, if cache is enabled.
    if (this._cache) {
      await this._cache.put(keyObj, result);
    }

    return result;
  }
}
