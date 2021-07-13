import { gql } from '@apollo/client/core';
import { GraphQLClient, GraphQLConfig } from '@vulcanize/ipld-eth-client';

export class Client {
  _config: GraphQLConfig;
  _client: GraphQLClient;

  constructor (config: GraphQLConfig) {
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
            txHash
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

                ... on InitializeEvent {
                  sqrtPriceX96
                  tick
                }

                ... on MintEvent {
                  sender
                  owner
                  tickLower
                  tickUpper
                  amount
                  amount0
                  amount1
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
