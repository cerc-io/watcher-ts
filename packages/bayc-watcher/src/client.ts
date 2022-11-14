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

  async getSupportsInterface (blockHash: string, contractAddress: string, interfaceId: string): Promise<any> {
    const { supportsInterface } = await this._client.query(
      gql(queries.supportsInterface),
      { blockHash, contractAddress, interfaceId }
    );

    return supportsInterface;
  }

  async getBalanceOf (blockHash: string, contractAddress: string, owner: string): Promise<any> {
    const { balanceOf } = await this._client.query(
      gql(queries.balanceOf),
      { blockHash, contractAddress, owner }
    );

    return balanceOf;
  }

  async getOwnerOf (blockHash: string, contractAddress: string, tokenId: bigint): Promise<any> {
    const { ownerOf } = await this._client.query(
      gql(queries.ownerOf),
      { blockHash, contractAddress, tokenId }
    );

    return ownerOf;
  }

  async getGetApproved (blockHash: string, contractAddress: string, tokenId: bigint): Promise<any> {
    const { getApproved } = await this._client.query(
      gql(queries.getApproved),
      { blockHash, contractAddress, tokenId }
    );

    return getApproved;
  }

  async getIsApprovedForAll (blockHash: string, contractAddress: string, owner: string, operator: string): Promise<any> {
    const { isApprovedForAll } = await this._client.query(
      gql(queries.isApprovedForAll),
      { blockHash, contractAddress, owner, operator }
    );

    return isApprovedForAll;
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

  async getTokenURI (blockHash: string, contractAddress: string, tokenId: bigint): Promise<any> {
    const { tokenURI } = await this._client.query(
      gql(queries.tokenURI),
      { blockHash, contractAddress, tokenId }
    );

    return tokenURI;
  }

  async getTotalSupply (blockHash: string, contractAddress: string): Promise<any> {
    const { totalSupply } = await this._client.query(
      gql(queries.totalSupply),
      { blockHash, contractAddress }
    );

    return totalSupply;
  }

  async getTokenOfOwnerByIndex (blockHash: string, contractAddress: string, owner: string, index: bigint): Promise<any> {
    const { tokenOfOwnerByIndex } = await this._client.query(
      gql(queries.tokenOfOwnerByIndex),
      { blockHash, contractAddress, owner, index }
    );

    return tokenOfOwnerByIndex;
  }

  async getTokenByIndex (blockHash: string, contractAddress: string, index: bigint): Promise<any> {
    const { tokenByIndex } = await this._client.query(
      gql(queries.tokenByIndex),
      { blockHash, contractAddress, index }
    );

    return tokenByIndex;
  }

  async getBaseURI (blockHash: string, contractAddress: string): Promise<any> {
    const { baseURI } = await this._client.query(
      gql(queries.baseURI),
      { blockHash, contractAddress }
    );

    return baseURI;
  }

  async getOwner (blockHash: string, contractAddress: string): Promise<any> {
    const { owner } = await this._client.query(
      gql(queries.owner),
      { blockHash, contractAddress }
    );

    return owner;
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
