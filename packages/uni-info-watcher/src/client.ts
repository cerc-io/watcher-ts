//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from '@apollo/client/core';
import { GraphQLClient, GraphQLConfig } from '@vulcanize/ipld-eth-client';
import { BlockHeight, OrderDirection } from '@vulcanize/util';

import {
  queryBundles,
  queryBurns,
  queryFactories,
  queryMints,
  queryPoolById,
  queryPoolDayDatas,
  queryPools,
  queryPositions,
  querySwaps,
  queryTicks,
  queryToken,
  queryTokenDayDatas,
  queryTokenHourDatas,
  queryTransactions,
  queryUniswapDayDatas
} from './queries';

export class Client {
  _config: GraphQLConfig;
  _client: GraphQLClient;

  constructor (config: GraphQLConfig) {
    this._config = config;

    this._client = new GraphQLClient(config);
  }

  async getToken (tokenId: string, block?: BlockHeight): Promise<any> {
    const { token } = await this._client.query(
      gql(queryToken),
      {
        block,
        id: tokenId
      }
    );

    return token;
  }

  async getFactories (first?: number, block?: BlockHeight): Promise<any> {
    const { factories } = await this._client.query(
      gql(queryFactories),
      {
        block,
        first
      }
    );

    return factories;
  }

  async getBundles (first?: number, block?: BlockHeight): Promise<any> {
    const { bundles } = await this._client.query(
      gql(queryBundles),
      {
        block,
        first
      }
    );

    return bundles;
  }

  async getPoolById (id: string): Promise<any> {
    const { pool } = await this._client.query(
      gql(queryPoolById),
      {
        id
      }
    );

    return pool;
  }

  async getTicks (where?: any, skip?: number, first?: number, block?: BlockHeight): Promise<any> {
    const { ticks } = await this._client.query(
      gql(queryTicks),
      {
        where,
        skip,
        first,
        block
      }
    );

    return ticks;
  }

  async getPools (where?: any, first?: number, orderBy?: string, orderDirection?: OrderDirection): Promise<any> {
    const { pools } = await this._client.query(
      gql(queryPools),
      {
        where,
        first,
        orderBy,
        orderDirection
      }
    );

    return pools;
  }

  async getUniswapDayDatas (where?: any, skip?: number, first?: number, orderBy?: string, orderDirection?: OrderDirection): Promise<any> {
    const { uniswapDayDatas } = await this._client.query(
      gql(queryUniswapDayDatas),
      {
        where,
        skip,
        first,
        orderBy,
        orderDirection
      }
    );

    return uniswapDayDatas;
  }

  async getPoolDayDatas (where?: any, skip?: number, first?: number, orderBy?: string, orderDirection?: OrderDirection): Promise<any> {
    const { poolDayDatas } = await this._client.query(
      gql(queryPoolDayDatas),
      {
        where,
        skip,
        first,
        orderBy,
        orderDirection
      }
    );

    return poolDayDatas;
  }

  async getTokenDayDatas (where?: any, skip?: number, first?: number, orderBy?: string, orderDirection?: OrderDirection): Promise<any> {
    const { tokenDayDatas } = await this._client.query(
      gql(queryTokenDayDatas),
      {
        where,
        skip,
        first,
        orderBy,
        orderDirection
      }
    );

    return tokenDayDatas;
  }

  async getTokenHourDatas (where?: any, skip?: number, first?: number, orderBy?: string, orderDirection?: OrderDirection): Promise<any> {
    const { tokenHourDatas } = await this._client.query(
      gql(queryTokenHourDatas),
      {
        where,
        skip,
        first,
        orderBy,
        orderDirection
      }
    );

    return tokenHourDatas;
  }

  async getMints (where?: any, first?: number, orderBy?: string, orderDirection?: OrderDirection): Promise<any> {
    const { mints } = await this._client.query(
      gql(queryMints),
      {
        where,
        first,
        orderBy,
        orderDirection
      }
    );

    return mints;
  }

  async getBurns (where?: any, first?: number, orderBy?: string, orderDirection?: OrderDirection): Promise<any> {
    const { burns } = await this._client.query(
      gql(queryBurns),
      {
        where,
        first,
        orderBy,
        orderDirection
      }
    );

    return burns;
  }

  async getSwaps (where?: any, first?: number, orderBy?: string, orderDirection?: OrderDirection): Promise<any> {
    const { swaps } = await this._client.query(
      gql(querySwaps),
      {
        where,
        first,
        orderBy,
        orderDirection
      }
    );

    return swaps;
  }

  async getTransactions (first?: number, { orderBy, mintOrderBy, burnOrderBy, swapOrderBy }: {[key: string]: string} = {}, orderDirection?: OrderDirection): Promise<any> {
    const { transactions } = await this._client.query(
      gql(queryTransactions),
      {
        first,
        orderBy,
        orderDirection,
        mintOrderBy,
        burnOrderBy,
        swapOrderBy
      }
    );

    return transactions;
  }

  async getPositions (where?: any, first?: number): Promise<any> {
    const { positions } = await this._client.query(
      gql(queryPositions),
      {
        where,
        first
      }
    );

    return positions;
  }
}
