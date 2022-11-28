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
  # dropdb mobymask-watcher

  createdb mobymask-watcher
  ```

* Create database for the job queue and enable the `pgcrypto` extension on them (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

  ```bash
  # If database already exists
  # dropdb mobymask-watcher-job-queue

  createdb mobymask-watcher-job-queue
  ```

  ```
  postgres@tesla:~$ psql -U postgres -h localhost mobymask-watcher-job-queue
  Password for user postgres:
  psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
  SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
  Type "help" for help.

  mobymask-watcher-job-queue=# CREATE EXTENSION pgcrypto;
  CREATE EXTENSION
  mobymask-watcher-job-queue=# exit
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

* Change directory to `packages/mobymask-watcher/` and run the watcher:

  ```bash
  yarn server
  ```

* Clone the [MobyMask](https://github.com/cerc-io/MobyMask) repo.

* Checkout to the branch with changes for using this watcher:

  ```bash
  # In MobyMask repo.
  git checkout use-laconic-watcher-as-hosted-index
  ```

* Run yarn to install the packages

  ```bash
  yarn
  ```

* Deploy the contract:

  ```bash
  cd packages/hardhat

  yarn deploy
  # deploying "PhisherRegistry" (tx: 0xaebeb2e883ece1f679304ec46f5dc61ca74f9e168427268a7dfa8802195b8de0)...: deployed at <MOBY_ADDRESS> with 2306221 gas
  # $ hardhat run scripts/publish.js
  # ✅  Published contracts to the subgraph package.
  # Done in 14.28s.
  ```
  
  Export the address of the deployed contract to a shell variable for later use:

  ```bash
  export MOBY_ADDRESS="<MOBY_ADDRESS>"
  ```

* Run the following GQL mutation in watcher GraphQL endpoint http://127.0.0.1:3010/graphql

  ```graphql
  mutation {
    watchContract(
      address: "MOBY_ADDRESS"
      kind: "PhisherRegistry"
      checkpoint: true
    )
  }
  ```

* Get the latest block

    ```graphql
    query {
      latestBlock {
        hash
        number
      }
    }
    ```

* Run the following GQL query in GraphQL endpoint

  ```graphql
  query {
    isPhisher(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "MOBY_ADDRESS"
      key0: "TWT:phishername"
    ) {
      value
      proof {
        data
      }
    }
    isMember(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "MOBY_ADDRESS"
      key0: "TWT:membername"
    ) {
      value
      proof {
        data
      }
    }
  }
  ```

* Run the following GQL subscription in generated watcher GraphQL endpoint:

  ```graphql
  subscription {
    onEvent {
      event {
        __typename
        ... on PhisherStatusUpdatedEvent {
          entity
          isPhisher
        },
        ... on MemberStatusUpdatedEvent {
          entity
          isMember
        }
      },
      block {
        number
        hash
      }
    }
  }
  ```

* Update isPhiser and isMember lists with names

  ```bash
  yarn claimPhisher --contract $MOBY_ADDRESS --name phisherName 
  ```

  ```bash
  yarn claimMember --contract $MOBY_ADDRESS --name memberName
  ```

* The events should be visible in the subscription at GQL endpoint. Note down the event blockHash from result.

* The isMember and isPhisher lists should be indexed. Check the database (mobymask-watcher) tables `is_phisher` and `is_member`, there should be entries at the event blockHash and the value should be true. The data is indexed in `handleEvent` method in the [hooks file](./src/hooks.ts).

* Update the the previous query with event blockHash and check isPhisher and isMember in GraphQL playground

  ```graphql
  query {
    isPhisher(
      blockHash: "EVENT_BLOCK_HASH"
      contractAddress: "MOBY_ADDRESS",
      key0: "TWT:phishername"
    ) {
      value
      proof {
        data
      }
    }
    
    isMember(
      blockHash: "EVENT_BLOCK_HASH"
      contractAddress: "MOBY_ADDRESS",
      key0: "TWT:membername"
    ) {
      value
      proof {
        data
      }
    }
  }
  ```

  The data is fetched from watcher database as it is already indexed.
