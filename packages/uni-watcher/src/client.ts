//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from '@apollo/client/core';
import { GraphQLClient, GraphQLConfig } from '@vulcanize/ipld-eth-client';

import { queryGetPool, queryPoolIdToPoolKey, queryPosition, queryEvents, subscribeEvents, queryGetContract } from './queries';

export class Client {
  _config: GraphQLConfig;
  _client: GraphQLClient;

  constructor (config: GraphQLConfig) {
    this._config = config;

    this._client = new GraphQLClient(config);
  }

  async watchEvents (onNext: (value: any) => void): Promise<ZenObservable.Subscription> {
    return this._client.subscribe(
      gql(subscribeEvents),
      ({ data }) => {
        onNext(data.onEvent);
      }
    );
  }

  async getEvents (blockHash: string, contract?: string): Promise<any> {
    const { events } = await this._client.query(
      gql(queryEvents),
      {
        blockHash,
        contract
      }
    );

    return events;
  }

  async getPosition (blockHash: string, tokenId: bigint): Promise<any> {
    const { position } = await this._client.query(
      gql(queryPosition),
      {
        blockHash,
        tokenId: tokenId.toString()
      }
    );

    return position;
  }

  async poolIdToPoolKey (blockHash: string, poolId: bigint): Promise<any> {
    const { poolIdToPoolKey } = await this._client.query(
      gql(queryPoolIdToPoolKey),
      {
        blockHash,
        poolId: poolId.toString()
      }
    );

    return poolIdToPoolKey;
  }

  async getPool (blockHash: string, token0: string, token1: string, fee: bigint): Promise<any> {
    const { getPool } = await this._client.query(
      gql(queryGetPool),
      {
        blockHash,
        token0,
        token1,
        fee: fee.toString()
      }
    );

    return getPool;
  }

  async getContract (type: string): Promise<any> {
    const { getContract } = await this._client.query(
      gql(queryGetContract),
      {
        type
      }
    );

    return getContract;
  }
}
