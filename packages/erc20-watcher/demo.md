# Demo

* The following core services need to be running for the demo:
  * [ipld-eth-db](https://github.com/cerc-io/ipld-eth-db)
    * Version: [v4.2.3-alpha](https://github.com/cerc-io/ipld-eth-db/releases/tag/v4.2.3-alpha)
  * [geth](https://github.com/cerc-io/go-ethereum)
    * State diffing service should use `ipld-eth-db` for database.
    * Version: [v1.10.26-statediff-4.2.2-alpha](https://github.com/cerc-io/go-ethereum/releases/tag/v1.10.26-statediff-4.2.2-alpha)
    * Endpoint: http://127.0.0.1:8545
  * [ipld-eth-server](https://github.com/cerc-io/ipld-eth-server)
    * Should use `ipld-eth-db` for database.
    * Version: [v4.2.3-alpha](https://github.com/cerc-io/ipld-eth-server/releases/tag/v4.2.3-alpha)
    * Endpoints:
      * GQL: http://127.0.0.1:8082/graphql
      * RPC: http://127.0.0.1:8081

* Create a postgres12 database for the watcher:

  ```bash
  sudo su - postgres

  # If database already exists
  # dropdb erc20-watcher

  createdb erc20-watcher
  ```

* Create database for the job queue and enable the `pgcrypto` extension on them (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

  ```bash
  # If database already exists
  # dropdb erc20-watcher-job-queue

  createdb erc20-watcher-job-queue
  ```

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

* In the [config file](./environments/local.toml) update the `database` connection settings.

* In `watcher-ts` repo, follow the instructions in [Setup](../../README.md#setup) for installing and building packages.

  ```bash
  # After setup
  yarn && yarn build
  ```

* Run the job-runner:

  ```bash
  yarn job-runner
  ```

* Run the watcher:

  ```bash
  yarn server
  ```

* Deploy an ERC20 token:

  ```bash
  yarn token:deploy
  # GLD Token deployed to: TOKEN_ADDRESS
  ```

  Export the address of the deployed token to a shell variable for later use:

  ```bash
  export TOKEN_ADDRESS="<TOKEN_ADDRESS>"
  ```

* Run the following command to watch the contract:

  ```bash
  yarn watch:contract --address $TOKEN_ADDRESS --kind ERC20 --checkpoint false
  ```

* Add a second account to Metamask and export the account address to a shell variable for later use:

  ```bash
  export RECIPIENT_ADDRESS="<RECIPIENT_ADDRESS>"
  ```

* To get the current block hash at any time, run:

  ```bash
  yarn block:latest
  ```

* Run the following GQL query against the [GraphQL endpoint](http://127.0.0.1:3001/graphql) to get name, symbol and total supply of the deployed token:

  ```graphql
  query {
    name(
      blockHash: "LATEST_BLOCK_HASH"
      token: "TOKEN_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }

    symbol(
      blockHash: "LATEST_BLOCK_HASH"
      token: "TOKEN_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }

    totalSupply(
      blockHash: "LATEST_BLOCK_HASH"
      token: "TOKEN_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
  }
  ```

* Run the following GQL query against the [GraphQL endpoint](http://127.0.0.1:3001/graphql) to get balances for the main and the recipient account at the latest block hash:

  ```graphql
  query {
    fromBalanceOf: balanceOf(
        blockHash: "LATEST_BLOCK_HASH"
        token: "TOKEN_ADDRESS",
        # main account having all the balance initially
        owner: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc"
      ) {
      value
      proof {
        data
      }
    }
    toBalanceOf: balanceOf(
        blockHash: "LATEST_BLOCK_HASH"
        token: "TOKEN_ADDRESS",
        owner: "RECIPIENT_ADDRESS"
      ) {
      value
      proof {
        data
      }
    }
  }
  ```

* Run the following GQL subscription at the GraphQL endpoint:

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

* Transfer tokens to the recipient account:

  ```bash
  yarn token:transfer --token $TOKEN_ADDRESS --to $RECIPIENT_ADDRESS --amount 100
  ```

  * A Transfer event to RECIPIENT_ADDRESS shall be visible in the subscription at endpoint.

  * Fire the GQL query above to get updated balances for the main (from) and the recipient (to) account.
