# ERC20 Watcher

## Overview

* Create developer facing GQL schema (`erc20.graphql`) for ERC20 contracts
    * GQL `queries` that return useful information
        * Individual token data corresponding to the ERC20 ABI
        * Aggregate data like running 1-day, 7-day & 30-day `transfer` counts and volumes
    * GQL `mutation` to add a new ERC20 contract to watch
* Create a server (`erc20-info-server`) to expose the above GQL API
    * Initally, the GQL resolvers will return mock data
* Create a basic `React` app (`erc20-dashboard`) that consumes the GQL API from `erc20-info-server`.
* Create a new watcher (`erc20-watcher-ts`) that is capable of watching multiple ERC20 tokens, capturing their events and state
    * Update the `erc20-info-server` GQL resolver to return data by querying the lower-layer `erc20-watcher-ts` GQL API
    * For GQL result data, at a minimum, return the request and list of CIDs/mhKeys required to generate that result.
        * Note: This implies, for example, performing aggregation in code instead of at the SQL layer.
* Create an ERC20 watcher factory (`erc20-watcher-factory-ts`) that auto-detects ERC20 tokens created on-chain and calls `erc20-info-server` to request watching them.

## Setup

This project uses [yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces/).

Install packages (Node.JS v15.11.0):

```bash
yarn
```

Run the watcher:

```bash
cd packages/watcher
yarn run server
```

GQL console: http://localhost:3001/graphql

To run tests (GQL queries) against the mock server:

```
cd packages/watcher
yarn run server:mock
```

```bash
cd packages/watcher
yarn test
```

## Example GQL Queries

```text
{
  name(blockHash: "0x5ef95c9847f15179b64fa57994355623f899aca097ad779421b8dff866a8b9c3", token: "0x1ca7c995f8eF0A2989BbcE08D5B7Efe50A584aa1") {
    value
    proof {
      data
    }
  }

  symbol(blockHash: "0x5ef95c9847f15179b64fa57994355623f899aca097ad779421b8dff866a8b9c3", token: "0x1ca7c995f8eF0A2989BbcE08D5B7Efe50A584aa1") {
    value
    proof {
      data
    }
  }

  totalSupply(blockHash: "0x5ef95c9847f15179b64fa57994355623f899aca097ad779421b8dff866a8b9c3", token: "0x1ca7c995f8eF0A2989BbcE08D5B7Efe50A584aa1") {
    value
    proof {
      data
    }
  }

  balanceOf(blockHash: "0x5ef95c9847f15179b64fa57994355623f899aca097ad779421b8dff866a8b9c3", token: "0x1ca7c995f8eF0A2989BbcE08D5B7Efe50A584aa1", owner: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc") {
    value
    proof {
      data
    }
  }

  allowance(blockHash: "0x81ed2b04af35b1b276281c37243212731202d5a191a27d07b22a605fd442998d", token: "0x1ca7c995f8eF0A2989BbcE08D5B7Efe50A584aa1", owner: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc", spender: "0xCA6D29232D1435D8198E3E5302495417dD073d61") {
    value
    proof {
      data
    }
  }

  events(blockHash: "0x3441ba476dff95c58528afe754ceec659e0ef8ff1b59244ec4545f4f9784a51c", token: "0x1ca7c995f8eF0A2989BbcE08D5B7Efe50A584aa1") {
    event {
      __typename
      ... on TransferEvent {
        from
        to
        value
      }
      ... on ApprovalEvent {
        owner
        spender
        value
      }
    }
    proof {
      data
    }
  }
}

```
