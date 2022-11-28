# Demo

* Clone the [stack-orchestrator](https://github.com/vulcanize/stack-orchestrator) repo.

* Create a `config.sh` file.

  ```bash
  cd stack-orchestrator/helper-scripts
  ./create-config.sh
  ```

* Setup the required repositories.

  ```bash
  ./setup-repositories.sh -p ssh
  ```

* Checkout [v4 release](https://github.com/vulcanize/go-ethereum/releases/tag/v1.10.26-statediff-4.2.2-alpha) in go-ethereum repo. The path for go-ethereum is specified by `vulcanize_go_ethereum` variable in `config.sh` file created in stack-orchestrator repo.

  ```bash
  # In go-ethereum repo.
  git checkout v1.10.26-statediff-4.2.2-alpha
  ```

* Update docker compose file to use latest images for ipld-eth-db and ipld-eth-server

  * In [docker/latest/docker-compose-db-sharding.yml](https://github.com/vulcanize/stack-orchestrator/blob/main/docker/latest/docker-compose-db-sharding.yml) update image version

    ```yml
    services:
      migrations:
        image: git.vdb.to/cerc-io/ipld-eth-db/ipld-eth-db:v4.2.3-alpha
    ```
  
  * In [docker/latest/docker-compose-ipld-eth-server.yml](https://github.com/vulcanize/stack-orchestrator/blob/main/docker/latest/docker-compose-ipld-eth-server.yml) update image version

    ```yml
    services:
      ipld-eth-server:
        image: git.vdb.to/cerc-io/ipld-eth-server/ipld-eth-server:v4.2.3-alpha
    ```

* To run the stack-orchestrator, the docker-compose version used is:

  ```bash
  docker-compose version

  # docker-compose version 1.29.2, build 5becea4c
  ```

* Run the stack-orchestrator

  ```bash
  cd stack-orchestrator/helper-scripts
  ```

  ```bash
  ./wrapper.sh -f true \
    -m true \
    -s v4 \
    -l latest \
    -v remove \
    -p ../config.sh
  ```

* Create a postgres12 database for the watcher:

  ```bash
  sudo su - postgres

  # If database already exists
  # dropdb graph-test-watcher

  createdb graph-test-watcher
  ```

* Create database for the job queue and enable the `pgcrypto` extension on them (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

  ```bash
  # If database already exists
  # dropdb graph-test-watcher-job-queue

  createdb graph-test-watcher-job-queue
  ```

  ```
  postgres@tesla:~$ psql -U postgres -h localhost graph-test-watcher-job-queue
  Password for user postgres:
  psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
  SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
  Type "help" for help.

  graph-test-watcher-job-queue=# CREATE EXTENSION pgcrypto;
  CREATE EXTENSION
  graph-test-watcher-job-queue=# exit
  ```

* In the [config file](./environments/local.toml) update the `database` connection settings.

* In `watcher-ts` repo, follow the instructions in [Setup](../../README.md#setup) for installing and building packages.

  ```bash
  # After setup
  yarn && yarn build
  ```

* In [packages/graph-node](../graph-node/), deploy an `Example` contract:

  ```bash
  yarn example:deploy
  ```

* Set the returned address to the variable `$EXAMPLE_ADDRESS`:

  ```bash
  EXAMPLE_ADDRESS=<EXAMPLE_ADDRESS>
  ```

* In [packages/graph-node/test/subgraph/example1/subgraph.yaml](../graph-node/test/subgraph/example1/subgraph.yaml):
    
    * Set the source address for `Example1` datasource to the `EXAMPLE_ADDRESS`.
    * Set the `startBlock` less than or equal to the latest mined block.

* Build the example subgraph:

  ```bash
  yarn build:example
  ```

* Run the job-runner:

  ```bash
  yarn job-runner
  ```

* Run the watcher:

  ```bash
  yarn server
  ```

* The output from the block handler in the mapping code should be visible in the `job-runner` for each block.

* Run the following GQL subscription at the graphql endpoint http://127.0.0.1:3008/graphql

  ```graphql
  subscription {
    onEvent {
      event {
        __typename
        ... on TestEvent {
          param1
          param2
        },
      },
      block {
        number
        hash
      }
    }
  }
  ```

* In [packages/graph-node](../graph-node/), trigger the `Test` event by calling a example contract method:

  ```bash
  yarn example:test --address $EXAMPLE_ADDRESS
  ```

  * A `Test` event shall be visible in the subscription at endpoint.

  * The subgraph entity `Category` should be updated in the database.

  * An auto-generated `diff-staged` entry `State` should be added.

* Run the query for entity in at the endpoint:

  ```graphql
  query {
    category(
      block: { hash: "EVENT_BLOCK_HASH" },
      id: "1"
    ) {
      __typename
      id
      count
      name
    }
  }
  ```

* Run the `getState` query at the endpoint to get the latest `State` for `EXAMPLE_ADDRESS`:

  ```graphql
  query {
    getState (
      blockHash: "EVENT_BLOCK_HASH"
      contractAddress: "EXAMPLE_ADDRESS"
      # kind: "checkpoint"
      # kind: "diff"
      kind: "diff_staged"
    ) {
      cid
      block {
        cid
        hash
        number
        timestamp
        parentHash
      }
      contractAddress
      data
    }
  }
  ```

* `diff` states get created corresponding to the `diff_staged` states when their respective blocks reach the pruned region.

* In [packages/graph-test-watcher](./):

  * After the `diff` state has been created, create a `checkpoint`:

    ```bash
    yarn checkpoint create --address $EXAMPLE_ADDRESS
    ```

    * A `checkpoint` state should be created at the latest canonical block hash.

    * Run the `getState` query again at the endpoint with the output `blockHash` and kind `checkpoint`.
  
* All the `State` entries can be seen in `pg-admin` in table `state`.

## Reset / Clean up

* To close down services in stack-orchestrator, hit `ctrl + c` in the terminal where it was run.

* To stop and remove stack-orchestrator services running in background run:

  ```bash
  cd stack-orchestrator

  docker-compose -f ./docker/latest/docker-compose-db-sharding.yml down -v --remove-orphans
  ```
