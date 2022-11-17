//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import fetch from 'cross-fetch';
import { createClient } from 'graphql-ws';
import ws from 'ws';
import { Subscription } from 'zen-observable-ts';

import {
  ApolloClient,
  NormalizedCacheObject,
  split,
  HttpLink,
  InMemoryCache,
  DocumentNode,
  TypedDocumentNode,
  from,
  DefaultOptions
} from '@apollo/client/core';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';

const log = debug('vulcanize:client');

export interface GraphQLConfig {
  gqlEndpoint: string;
  gqlSubscriptionEndpoint?: string;
}

export class GraphQLClient {
  _config: GraphQLConfig;
  _client: ApolloClient<NormalizedCacheObject>;

  constructor (config: GraphQLConfig) {
    this._config = config;

    const { gqlEndpoint, gqlSubscriptionEndpoint } = config;

    assert(gqlEndpoint, 'Missing gql endpoint');

    const httpLink = new HttpLink({
      uri: gqlEndpoint,
      fetch
    });

    let link = from([httpLink]);

    if (gqlSubscriptionEndpoint) {
      // https://www.apollographql.com/docs/react/data/subscriptions/
      const subscriptionClient = createClient({
        url: gqlSubscriptionEndpoint,
        shouldRetry: () => true,
        webSocketImpl: ws
      });

      subscriptionClient.on('connected', () => {
        log('Subscription client connected successfully');
      });

      subscriptionClient.on('error', (error: any) => {
        log('Subscription client error', error.message);
      });

      const wsLink = new GraphQLWsLink(subscriptionClient);

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

      link = splitLink;
    }

    const defaultOptions: DefaultOptions = {
      watchQuery: {
        fetchPolicy: 'no-cache'
      },
      query: {
        fetchPolicy: 'no-cache'
      }
    };

    this._client = new ApolloClient({
      link,
      cache: new InMemoryCache(),
      defaultOptions
    });
  }

  async subscribe (query: DocumentNode, onNext: (value: any) => void): Promise<Subscription> {
    const observable = this._client.subscribe({ query });

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

  async mutate (mutation: DocumentNode | TypedDocumentNode, variables: { [key: string]: any }): Promise<any> {
    const { data: result } = await this._client.mutate({ mutation, variables });

    return result;
  }
}
