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
    * For GQL result data, at a minimum, log the request and list of CIDs/mhKeys required to generate that result.
        * Note: This implies, for example, performing aggregation in code instead of at the SQL layer.
* Create an ERC20 watcher factory (`erc20-watcher-factory-ts`) that auto-detects ERC20 tokens created on-chain and calls `erc20-info-server` to request watching them.

## Setup

This project uses [yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces/).

Install packages:

```bash
yarn
```

Run the GQL server:

```bash
cd packages/server
yarn run server
```

GQL console: http://localhost:3001/graphql


## Example GQL Queries

```text
{
  balanceOf(blockHash: "0x77b5479a5856dd8ec63df6aabf9ce0913071a6dda3a3d54f3c9c940574bcb8ab", token: "0xd87fea54f506972e3267239ec8e159548892074a", owner: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc") {
    value
    proof {
      data
    }
  }

  allowance(blockHash: "0x77b5479a5856dd8ec63df6aabf9ce0913071a6dda3a3d54f3c9c940574bcb8ab", token: "0xd87fea54f506972e3267239ec8e159548892074a", owner: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc", spender: "0xCA6D29232D1435D8198E3E5302495417dD073d61") {
    value
    proof {
      data
    }
  }

  events(blockHash: "0x77b5479a5856dd8ec63df6aabf9ce0913071a6dda3a3d54f3c9c940574bcb8ab", token: "0xd87fea54f506972e3267239ec8e159548892074a") {
    event {
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
