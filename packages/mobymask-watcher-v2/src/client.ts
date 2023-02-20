//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from '@apollo/client/core';
import { GraphQLClient, GraphQLConfig } from '@cerc-io/ipld-eth-client';

import { queries, mutations, subscriptions } from './gql';

export class Client {
  _config: GraphQLConfig;
  _client: GraphQLClient;

  constructor (config: GraphQLConfig) {
    this._config = config;

    this._client = new GraphQLClient(config);
  }

  async getMultiNonce (blockHash: string, contractAddress: string, key0: string, key1: bigint): Promise<any> {
    const { multiNonce } = await this._client.query(
      gql(queries.multiNonce),
      { blockHash, contractAddress, key0, key1 }
    );

    return multiNonce;
  }

  async _getOwner (blockHash: string, contractAddress: string): Promise<any> {
    const { _owner } = await this._client.query(
      gql(queries._owner),
      { blockHash, contractAddress }
    );

    return _owner;
  }

  async getIsRevoked (blockHash: string, contractAddress: string, key0: string): Promise<any> {
    const { isRevoked } = await this._client.query(
      gql(queries.isRevoked),
      { blockHash, contractAddress, key0 }
    );

    return isRevoked;
  }

  async getIsPhisher (blockHash: string, contractAddress: string, key0: string): Promise<any> {
    const { isPhisher } = await this._client.query(
      gql(queries.isPhisher),
      { blockHash, contractAddress, key0 }
    );

    return isPhisher;
  }

  async getIsMember (blockHash: string, contractAddress: string, key0: string): Promise<any> {
    const { isMember } = await this._client.query(
      gql(queries.isMember),
      { blockHash, contractAddress, key0 }
    );

    return isMember;
  }

  async getEvents (blockHash: string, contractAddress: string, name: string): Promise<any> {
    const { events } = await this._client.query(
      gql(queries.events),
      { blockHash, contractAddress, name }
    );

    return events;
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<any> {
    const { eventsInRange } = await this._client.query(
      gql(queries.eventsInRange),
      { fromBlockNumber, toBlockNumber }
    );

    return eventsInRange;
  }

  async watchContract (contractAddress: string, startingBlock?: number): Promise<any> {
    const { watchContract } = await this._client.mutate(
      gql(mutations.watchContract),
      { contractAddress, startingBlock }
    );

    return watchContract;
  }

  async watchEvents (onNext: (value: any) => void): Promise<ZenObservable.Subscription> {
    return this._client.subscribe(
      gql(subscriptions.onEvent),
      ({ data }) => {
        onNext(data.onEvent);
      }
    );
  }
}
