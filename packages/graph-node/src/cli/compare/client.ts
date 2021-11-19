//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import fs from 'fs';
import path from 'path';

import { gql } from '@apollo/client/core';
import { GraphQLClient, GraphQLConfig } from '@vulcanize/ipld-eth-client';

export class Client {
  _config: GraphQLConfig;
  _graphqlClient: GraphQLClient;

  constructor (config: GraphQLConfig) {
    this._config = config;

    const { gqlEndpoint } = config;

    assert(gqlEndpoint, 'Missing gql endpoint');

    this._graphqlClient = new GraphQLClient(config);
  }

  async getEntity ({ queryName, id, blockHash }: { queryName: string, id: string, blockHash: string }): Promise<any> {
    const entityQuery = fs.readFileSync(path.join(__dirname, `queries/${queryName}.gql`), 'utf8');

    return this._graphqlClient.query(
      gql(entityQuery),
      {
        id,
        blockHash
      }
    );
  }
}
