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
  _queryDir: string;

  constructor (config: GraphQLConfig, queryDir: string) {
    this._config = config;
    this._queryDir = path.resolve(process.cwd(), queryDir);

    const { gqlEndpoint } = config;
    assert(gqlEndpoint, 'Missing gql endpoint');

    this._graphqlClient = new GraphQLClient(config);
  }

  async getEntity ({ blockHash, queryName, id }: { blockHash: string, queryName: string, id: string }): Promise<any> {
    const entityQuery = fs.readFileSync(path.resolve(this._queryDir, `${queryName}.gql`), 'utf8');

    return this._graphqlClient.query(
      gql(entityQuery),
      {
        id,
        blockHash
      }
    );
  }
}
