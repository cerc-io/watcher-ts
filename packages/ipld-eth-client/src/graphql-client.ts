import assert from 'assert';
import debug from 'debug';
import fetch from 'cross-fetch';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import ws from 'ws';

import { ApolloClient, NormalizedCacheObject, split, HttpLink, InMemoryCache, DocumentNode, TypedDocumentNode } from '@apollo/client/core';
import { getMainDefinition } from '@apollo/client/utilities';
import { WebSocketLink } from '@apollo/client/link/ws';

const log = debug('vulcanize:client');

export interface GraphQLConfig {
  gqlEndpoint: string;
  gqlSubscriptionEndpoint: string;
}

export class GraphQLClient {
  _config: GraphQLConfig;
  _client: ApolloClient<NormalizedCacheObject>;

  constructor (config: GraphQLConfig) {
    this._config = config;

    const { gqlEndpoint, gqlSubscriptionEndpoint } = config;

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
  }

  async subscribe (query: DocumentNode, onNext: (value: any) => void): Promise<ZenObservable.Subscription> {
    const observable = await this._client.subscribe({ query });

    return observable.subscribe({
      next (data) {
        onNext(data);
      }
    });
  }

  async query (query: DocumentNode | TypedDocumentNode, variables: { [key: string]: any }): Promise<any> {
    const { data: result } = await this._client.query({ query, variables });

    return result;
  }
}
