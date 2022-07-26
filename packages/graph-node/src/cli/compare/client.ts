//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import pluralize from 'pluralize';

import { gql } from '@apollo/client/core';
import { GraphQLClient, Config } from '@vulcanize/ipld-eth-client';
import { Cache } from '@vulcanize/cache';

export class Client {
  _config: Config;
  _graphqlClient: GraphQLClient;
  _queryDir: string;
  _cache: Cache | undefined;
  _endpoint: string;

  constructor (config: Config, queryDir: string) {
    this._config = config;
    this._queryDir = path.resolve(process.cwd(), queryDir);

    const { gqlEndpoint, cache } = config;
    assert(gqlEndpoint, 'Missing gql endpoint');
    this._endpoint = gqlEndpoint;

    this._graphqlClient = new GraphQLClient(config);

    this._cache = cache;
  }

  get endpoint () {
    return this._endpoint;
  }

  async getResult (queryName: string, params: { [key: string]: any }): Promise<any> {
    return this._getCachedOrFetch(queryName, params);
  }

  async getIds (queryName: string, blockNumber: number): Promise<string[]> {
    const keyObj = { queryName, blockNumber };

    if (this._cache) {
      const [value, found] = await this._cache.get(keyObj) || [undefined, false];
      if (found) {
        return value;
      }
    }

    const result = await this._graphqlClient.query(
      gql(
        `query($blockNumber: Int){
          ${pluralize(queryName)}(
            block: { number: $blockNumber }
          ) {
            id
          }
        }`
      ),
      {
        blockNumber
      }
    );

    const ids = result[pluralize(queryName)].map((entity: { id: string }) => entity.id);

    // Cache the result and return it, if cache is enabled.
    if (this._cache) {
      await this._cache.put(keyObj, ids);
    }

    return ids;
  }

  async _getCachedOrFetch (queryName: string, params: {[key: string]: any}): Promise<any> {
    const keyObj = {
      queryName,
      params
    };

    // Check if request cached in db, if cache is enabled.
    if (this._cache) {
      const [value, found] = await this._cache.get(keyObj) || [undefined, false];
      if (found) {
        return value;
      }
    }

    const entityQuery = fs.readFileSync(path.resolve(this._queryDir, `${queryName}.gql`), 'utf8');

    // Result not cached or cache disabled, need to perform an upstream GQL query.
    const result = await this._graphqlClient.query(
      gql(entityQuery),
      params
    );

    // Cache the result and return it, if cache is enabled.
    if (this._cache) {
      await this._cache.put(keyObj, result);
    }

    return result;
  }
}
