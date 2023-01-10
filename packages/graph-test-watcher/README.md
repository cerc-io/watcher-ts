# Example Watcher

## Setup

First try the [stack orchestrator](https://github.com/cerc-io/stack-orchestrator) to quickly get started. Advanced users can see [here](/docs/README.md) for instructions on setting up a local environment by hand.

Run the following command to install required packages:

```bash
yarn
```

## Run

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

* The existing example hooks in [hooks.ts](./src/hooks.ts) are for an `ERC20` contract.
