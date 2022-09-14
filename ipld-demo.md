# Demo for IPLD statediff and checkpointing

* In the root of `watcher-ts`, run:

  ```bash
  yarn && yarn build
  ```

* In console, run the IPFS daemon:

  ```bash
  # Verify ipfs version
  ipfs version
  # ipfs version 0.12.2

  ipfs daemon
  ```

* The following services should be running to work with watcher:

  * [cerc-io/go-ethereum](https://github.com/cerc-io/go-ethereum) ([v1.10.17-statediff-3.2.0](https://github.com/vulcanize/go-ethereum/releases/tag/v1.10.17-statediff-3.2.0)) on port 8545.
  * [cerc-io/ipld-eth-server](https://github.com/cerc-io/ipld-eth-server) ([v3.0.0](https://github.com/vulcanize/ipld-eth-server/releases/tag/v3.0.0)) with native GQL API enabled on port 8082 and RPC API enabled on port 8081.

* Deploy `Example` contract:

  ```bash
  cd packages/graph-node

  yarn example:deploy
  ```

* Set the returned address to the variable `$EXAMPLE_ADDRESS`:

  ```bash
  EXAMPLE_ADDRESS=
  ```

* In `packages/graph-node`, run:

  ```bash
  cp .env.example .env
  ```

  * In `.env` file, set `EXAMPLE_CONTRACT_ADDRESS` to the `EXAMPLE_ADDRESS`.

  * In [packages/graph-node/test/subgraph/example1/subgraph.yaml](./packages/graph-node/test/subgraph/example1/subgraph.yaml), set the source address for `Example1` datasource to the `EXAMPLE_ADDRESS`.

  ```bash
  yarn build:example
  ```

* In `packages/codegen`, create a `config.yaml` file with the following contents:

  ```yaml
  contracts:
    - name: Example
      path: ../graph-node/test/contracts/Example.sol
      kind: Example1

  outputFolder: ../demo-example-watcher
  mode: all
  kind: active
  port: 3008
  flatten: true
  subgraphPath: ../graph-node/test/subgraph/example1/build
  ```

  Reference: [packages/codegen/README.md](./packages/codegen/README.md#run)

* Generate watcher:

  ```bash
  cd packages/codegen

  yarn codegen --config-file ./config.yaml
  ```

* In `packages/demo-example-watcher`, run:

  ```bash
  yarn
  ```

* Create dbs:

  ```bash
  sudo su - postgres
  # Delete databases if they already exist.
  dropdb demo-example-watcher
  dropdb demo-example-watcher-job-queue

  # Create databases
  createdb demo-example-watcher
  createdb demo-example-watcher-job-queue
  ```

  Enable the `pgcrypto` extension.
  ```
  psql -U postgres -h localhost demo-example-watcher-job-queue

  demo-example-watcher-job-queue=# CREATE EXTENSION pgcrypto;
  demo-example-watcher-job-queue=# exit
  ```

* In a new terminal, in `packages/demo-example-watcher`, run:

  ```bash
  yarn server
  ```

  ```bash
  yarn job-runner
  ```

* Run the following GQL subscription at the [graphql endpoint](http://127.0.0.1:3008/graphql):

  ```graphql
  subscription {
    onEvent {
      event {
        __typename
        ... on TestEvent {
          param1
          param2
          param3
        },
      },
      block {
        number
        hash
      }
    }
  }
  ```

* Trigger the `Test` event by calling example contract method:

  ```bash
  cd packages/graph-node

  yarn example:test --address $EXAMPLE_ADDRESS
  ```

  A `Test` event shall be visible in the subscription at endpoint.

* Run the `getState` query at the endpoint to get the latest `IPLDBlock` for `EXAMPLE_ADDRESS`:

  ```graphql
  query {
    getState (
      blockHash: "EVENT_BLOCK_HASH"
      contractAddress: "EXAMPLE_ADDRESS"
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

* Run the query for entity at the endpoint:

  ```graphql
  query {
    author (
      block: {
        hash: "EVENT_BLOCK_HASH"
      }
      id: "0xdc7d7a8920c8eecc098da5b7522a5f31509b5bfc"
    ) {
      __typename
      name
      paramInt
      paramBigInt
      paramBytes
    }
  }
  ```

* `diff` IPLDBlocks get created corresponding to the `diff_staged` blocks when their respective `eth_block`s reach the pruned region.

* In `packages/demo-example-watcher`:

  * After the `diff` block has been created, create a `checkpoint`:

    ```bash
    cd packages/demo-example-watcher

    yarn checkpoint --address $EXAMPLE_ADDRESS
    ```

    * A `checkpoint` IPLDBlock should be created at the latest canonical block hash.

    * Run the `getState` query again at the endpoint with the output `blockHash` and kind `checkpoint`.

* All the `IPLDBlock` entries can be seen in `pg-admin` in table `ipld_block`.

* All the `diff` and `checkpoint` IPLDBlocks should be pushed to `IPFS`.

* Open IPFS WebUI http://127.0.0.1:5001/webui and search for `IPLDBlock`s using their `CID`s.
