import { gql } from '@apollo/client/core';
import { GraphQLClient, GraphQLConfig } from '@vulcanize/ipld-eth-client';

import { queryGetPool, queryPoolIdToPoolKey, queryPosition } from './queries';

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

              ... on IncreaseLiquidityEvent {
                tokenId
                liquidity
                amount0
                amount1
              }

              ... on DecreaseLiquidityEvent {
                tokenId
                liquidity
                amount0
                amount1
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

  async getPosition (blockHash: string, tokenId: bigint): Promise<any> {
    const { position } = await this._client.query(
      gql(queryPosition),
      {
        blockHash,
        tokenId: tokenId.toString()
      }
    );

    return position;
  }

  async poolIdToPoolKey (blockHash: string, poolId: bigint): Promise<any> {
    const { poolIdToPoolKey } = await this._client.query(
      gql(queryPoolIdToPoolKey),
      {
        blockHash,
        poolId: poolId.toString()
      }
    );

    return poolIdToPoolKey;
  }

  async getPool (blockHash: string, token0: string, token1: string, fee: bigint): Promise<any> {
    const { getPool } = await this._client.query(
      gql(queryGetPool),
      {
        blockHash,
        token0,
        token1,
        fee: fee.toString()
      }
    );

    return getPool;
  }
}
