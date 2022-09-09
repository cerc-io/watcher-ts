//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from '@apollo/client/core';
import { GraphQLClient, GraphQLConfig } from '@cerc-io/ipld-eth-client';

import { queryName, queryDecimals, queryTotalSupply, querySymbol } from './queries';

export class Client {
  _config: GraphQLConfig;
  _client: GraphQLClient;

  constructor (config: GraphQLConfig) {
    this._config = config;

    this._client = new GraphQLClient(config);
  }

  async getSymbol (blockHash: string, token: string): Promise<any> {
    const { symbol } = await this._client.query(
      gql(querySymbol),
      { blockHash, token }
    );

    return symbol;
  }

  async getName (blockHash: string, token: string): Promise<any> {
    const { name } = await this._client.query(
      gql(queryName),
      { blockHash, token }
    );

    return name;
  }

  async getTotalSupply (blockHash: string, token: string): Promise<any> {
    const { totalSupply } = await this._client.query(
      gql(queryTotalSupply),
      { blockHash, token }
    );

    return totalSupply;
  }

  async getDecimals (blockHash: string, token: string): Promise<any> {
    const { decimals } = await this._client.query(
      gql(queryDecimals),
      { blockHash, token }
    );

    return decimals;
  }
}
