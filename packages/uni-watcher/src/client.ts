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
            block {
              number
              hash
              timestamp
            }
            contract
            tx {
              hash
            }
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

              ... on BurnEvent {
                owner
                tickLower
                tickUpper
                amount
                amount0
                amount1
              }

              ... on SwapEvent {
                sender
                recipient
                amount0
                amount1
                sqrtPriceX96
                liquidity
                tick
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
