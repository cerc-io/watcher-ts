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

  async getTotalSupply (blockHash: string, contractAddress: string): Promise<any> {
    const { totalSupply } = await this._client.query(
      gql(queries.totalSupply),
      { blockHash, contractAddress }
    );

    return totalSupply;
  }

  async getBalanceOf (blockHash: string, contractAddress: string, account: string): Promise<any> {
    const { balanceOf } = await this._client.query(
      gql(queries.balanceOf),
      { blockHash, contractAddress, account }
    );

    return balanceOf;
  }

  async getAllowance (blockHash: string, contractAddress: string, owner: string, spender: string): Promise<any> {
    const { allowance } = await this._client.query(
      gql(queries.allowance),
      { blockHash, contractAddress, owner, spender }
    );

    return allowance;
  }

  async getName (blockHash: string, contractAddress: string): Promise<any> {
    const { name } = await this._client.query(
      gql(queries.name),
      { blockHash, contractAddress }
    );

    return name;
  }

  async getSymbol (blockHash: string, contractAddress: string): Promise<any> {
    const { symbol } = await this._client.query(
      gql(queries.symbol),
      { blockHash, contractAddress }
    );

    return symbol;
  }

  async getDecimals (blockHash: string, contractAddress: string): Promise<any> {
    const { decimals } = await this._client.query(
      gql(queries.decimals),
      { blockHash, contractAddress }
    );

    return decimals;
  }

  async _getBalances (blockHash: string, contractAddress: string, key0: string): Promise<any> {
    const { _balances } = await this._client.query(
      gql(queries._balances),
      { blockHash, contractAddress, key0 }
    );

    return _balances;
  }

  async _getAllowances (blockHash: string, contractAddress: string, key0: string, key1: string): Promise<any> {
    const { _allowances } = await this._client.query(
      gql(queries._allowances),
      { blockHash, contractAddress, key0, key1 }
    );

    return _allowances;
  }

  async _getTotalSupply (blockHash: string, contractAddress: string): Promise<any> {
    const { _totalSupply } = await this._client.query(
      gql(queries._totalSupply),
      { blockHash, contractAddress }
    );

    return _totalSupply;
  }

  async _getName (blockHash: string, contractAddress: string): Promise<any> {
    const { _name } = await this._client.query(
      gql(queries._name),
      { blockHash, contractAddress }
    );

    return _name;
  }

  async _getSymbol (blockHash: string, contractAddress: string): Promise<any> {
    const { _symbol } = await this._client.query(
      gql(queries._symbol),
      { blockHash, contractAddress }
    );

    return _symbol;
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
