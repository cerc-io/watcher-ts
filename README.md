# watcher-ts

## Setup

This project uses [yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces/).

Install packages (Node.JS v15.11.0):

```bash
yarn
```

## ERC20 Watcher

Create a postgres12 database and provide connection settings in `environments/local.toml`.

For example:

```
sudo su - postgres
createdb erc20-watcher
```

Update the `upstream` config in `environments/local.toml` and provide the `ipld-eth-server` GQL API and the `indexer-db` postgraphile endpoints.

Run the watcher:

```bash
cd packages/erc20-watcher
yarn run server
```

GQL console: http://localhost:3001/graphql

To run tests (GQL queries) against the mock server:

```
cd packages/erc20-watcher
yarn run server:mock
```

```bash
cd packages/erc20-watcher
yarn test
```

### Example GQL Queries

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
