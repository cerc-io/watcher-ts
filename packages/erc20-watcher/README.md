# ERC20 Watcher

## Setup

Create a postgres12 database for the job queue:

```
sudo su - postgres
createdb erc20-watcher-job-queue
```

Enable the `pgcrypto` extension on the job queue database (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro).

Example:

```
postgres@tesla:~$ psql -U postgres -h localhost erc20-watcher-job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

erc20-watcher-job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
erc20-watcher-job-queue=# exit
```

Create a postgres12 database for the erc20 watcher:

```
sudo su - postgres
createdb erc20-watcher
```

Update `environments/local.toml` with database connection settings for both the databases.

Update the `upstream` config in `environments/local.toml` and provide the `ipld-eth-server` GQL API and the `indexer-db` postgraphile endpoints.

## Run

Build files:

```bash
yarn build
```

Run the watcher:

```bash
$ yarn server

# For development.
$ yarn server:dev

# For specifying config file.
$ yarn server -f environments/local.toml
```

Start the job runner:

```bash
$ yarn job-runner

# For development.
$ yarn job-runner:dev

# For specifying config file.
$ yarn job-runner -f environments/local.toml
```

GQL console: http://localhost:3001/graphql

Start watching a token:

```bash
$ yarn watch:contract --address 0xTokenAddress --startingBlock <start-block>

# For specifying config file.
$ yarn watch:contract -f environments/local.toml --address 0xTokenAddress --startingBlock <start-block>
```

Example:

```bash
$ yarn watch:contract --address 0xfE0034a874c2707c23F91D7409E9036F5e08ac34 --startingBlock 100
```

To fill a block range:

```bash
yarn fill --startBlock <from-block> --endBlock <to-block>

# For specifying config file.
$ yarn fill -f environments/local.toml --startBlock <from-block> --endBlock <to-block>
```

Example:

```bash
$ yarn fill --startBlock 1000 --endBlock 2000
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

## Test

To run tests (GQL queries) against the mock server:

```
yarn run server:mock
```

```bash
yarn test
```
