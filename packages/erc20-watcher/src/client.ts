import { gql } from 'apollo-server-express';
import { GraphQLClient } from '@vulcanize/ipld-eth-client';

import { querySymbol } from './queries';

interface Config {
  gqlEndpoint: string;
  gqlSubscriptionEndpoint: string;
}

export class Client {
  _config: Config;
  _client: GraphQLClient;

  constructor (config: Config) {
    this._config = config;

    this._client = new GraphQLClient(config);
  }

  async getSymbol (blockHash: string | undefined, token: string): Promise<any> {
    const { symbol } = await this._client.query(
      gql(querySymbol),
      { blockHash, token }
    );

    return symbol;
  }
}
