import { gql } from 'apollo-server-express';
import { GraphQLClient } from '@vulcanize/ipld-eth-client';

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

  async watchEvents (onNext: (value: any) => void): Promise<ZenObservable.Subscription> {
    return this._client.subscribe(
      gql`
        subscription SubscriptionReceipt {
          onEvent {
            blockHash
            blockNumber
            contract
            event {
              proof {
                data
              }
              event {
                __typename
                ... on PoolCreatedEvent {
                  token0
                  token1
                  fee
                  tickSpacing
                  pool
                }
              }
            }
          }
        }
      `,
      ({ data }) => {
        onNext(data.onEvent);
      }
    );
  }
}
