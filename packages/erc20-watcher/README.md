# ERC20 Watcher

First try the [erc20 demo in stack orchestrator](https://github.com/cerc-io/stack-orchestrator/tree/main/app/data/stacks/erc20) to quickly get started. Advanced users can see [here](/docs/README.md) for instructions on setting up a local environment by hand. 

## Build 

Build files:

```bash
yarn build
```

## Run 
  
Start the job runner:

```bash
yarn job-runner
```

For development or to specify the config file:
```bash
 yarn job-runner:dev
 yarn job-runner -f environments/local.toml
```

Then, Start the server:

```bash
yarn server
```

For development or to specify the config file:
```bash
yarn server:dev
yarn server -f environments/local.toml
```

See the GQL console at: http://localhost:3001/graphql
Note: the port may be different depending on your configuration.

Deploy an ERC20 token:

```bash
yarn token:deploy
```
In the output you'll see:

```bash
GLD Token deployed to: 0xTokenAddress
```
  
Export the address of the deployed token to a shell variable for later use:

```bash
export TOKEN_ADDRESS=0xTokenAddress
```

Get the main account address:
```bash
yarn account
```

and export it as well:

```bash
export PRIMARY_ACCOUNT=0xPrimaryAccount
```

Run the following command to watch the contract:

```bash
yarn watch:contract --address $TOKEN_ADDRESS --kind ERC20 --checkpoint false
```

For specifying a config file:
```bash
yarn watch:contract -f environments/local.toml --address 0xTokenAddress --kind ERC20 --checkpoint false
```

To fill a block range:

```bash
yarn fill --startBlock <from-block> --endBlock <to-block>
```

To get the current block hash at any time, run:

```bash
yarn block:latest
```

Add a new account to Metamask and export the account address to a shell variable for later use:

```bash
export RECIPIENT_ADDRESS=0xRecipientAddress
```

Run the following GQL query against the [http://127.0.0.1:3001/graphql](http://127.0.0.1:3001/graphql) to get the name, symbol and total supply of the deployed token:

```graphql
query {
  name(
    blockHash: "LATEST_BLOCK_HASH"
    token: "0xTokenAddress"
  ) {
    value
    proof {
      data
    }
  }

  symbol(
    blockHash: "LATEST_BLOCK_HASH"
    token: "0xTokenAddress"
  ) {
    value
    proof {
      data
    }
  }

  totalSupply(
    blockHash: "LATEST_BLOCK_HASH"
    token: "0xTokenAddress"
  ) {
    value
    proof {
      data
    }
  }
}
```

Run the following GQL query to get balances for the main and the recipient account at the latest block hash:

```graphql
query {
  fromBalanceOf: balanceOf(
      blockHash: "LATEST_BLOCK_HASH"
      token: "0xTokenAddress",
      # main/primary account having all the balance initially
      owner: "0xPrimaryAccount"
    ) {
    value
    proof {
      data
    }
  }
  toBalanceOf: balanceOf(
      blockHash: "LATEST_BLOCK_HASH"
      token: "0xTokenAddress",
      owner: "0xRecipientAddress"
    ) {
    value
    proof {
      data
    }
  }
}
```

Run the following GQL subscription at the GraphQL endpoint:

```graphql
subscription {
  onEvent {
    blockHash
    contract
    event {
      __typename
      ... on TransferEvent {
        from
        to
        value
      },
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

Transfer tokens to the recipient account:

```bash
yarn token:transfer --token $TOKEN_ADDRESS --to $RECIPIENT_ADDRESS --amount 100
```

A Transfer event to the `RECIPIENT_ADDRESS` should be visible in the subscription.

Get the latest block hash again, then fire the GQL query above to get updated balances for the main (from) and the recipient (to) account.
