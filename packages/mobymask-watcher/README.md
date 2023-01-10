# MobyMask Watcher 

First try the [mobymask demo in stack orchestrator](https://github.com/cerc-io/stack-orchestrator/tree/main/app/data/stacks/mobymask) to quickly get started. Advanced users can see [here](/docs/README.md) for instructions on setting up a local environment by hand. 

## Setup

Run the following command to install required packages:

```bash
yarn && yarn build
```

If the watcher is "lazy", run the server:

```bash
yarn server
```

GQL console: http://localhost:3010/graphql

If the watcher is "active", run the job-runner:

```bash
yarn job-runner
```
then the server:

```bash
yarn server
```

Next, clone the MobyMask repo and checkout this branch:

```bash
git clone https://github.com/cerc-io/MobyMask && cd MobyMask
git checkout use-laconic-watcher-as-hosted-index
```

Install the packages:
```bash
yarn
```

Deploy the contract:
```bash
cd packages/hardhat

yarn deploy
# deploying "PhisherRegistry" (tx: 0xaebeb2e883ece1f679304ec46f5dc61ca74f9e168427268a7dfa8802195b8de0)...: deployed at 0xMobyAddress with 2306221 gas
# $ hardhat run scripts/publish.js
# ✅  Published contracts to the subgraph package.
# Done in 14.28s.
```

Export the address of the deployed contract to a shell variable for later use:

```bash
export MOBY_ADDRESS="0xMobyAddress"
```

Run the following GQL mutation in watcher GraphQL endpoint http://127.0.0.1:3010/graphql

```graphql
mutation {
  watchContract(
    address: "MOBY_ADDRESS"
    kind: "PhisherRegistry"
    checkpoint: true
  )
}
```

Get the latest block

  ```graphql
  query {
    latestBlock {
      hash
      number
    }
  }
  ```

Run the following GQL query in GraphQL endpoint

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

Run the following GQL subscription in generated watcher GraphQL endpoint:

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

Update isPhiser and isMember lists with names

```bash
yarn claimPhisher --contract $MOBY_ADDRESS --name phisherName 
```

```bash
yarn claimMember --contract $MOBY_ADDRESS --name memberName
```

- The events should be visible in the subscription at GQL endpoint. Note down the event blockHash from result.

- The isMember and isPhisher lists should be indexed. Check the database (mobymask-watcher) tables `is_phisher` and `is_member`, there should be entries at the event blockHash and the value should be true. The data is indexed in `handleEvent` method in the [hooks file](./src/hooks.ts).

Update the the previous query with event blockHash and check isPhisher and isMember in GraphQL playground

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

## Additional Commands

To watch a contract, run:

```bash
yarn watch:contract --address <contract-address> --kind <contract-kind> --checkpoint <true | false> --starting-block [block-number]
```
where:
- `address`: Address or identifier of the contract to be watched.
- `kind`: Kind of the contract.
- `checkpoint`: Turn checkpointing on (`true` | `false`).
- `starting-block`: Starting block for the contract (default: `1`).

Examples:

Watch a contract with its address and checkpointing on:

```bash
yarn watch:contract --address 0x1F78641644feB8b64642e833cE4AFE93DD6e7833 --kind ERC20 --checkpoint true
```

Watch a contract with its identifier and checkpointing on:

```bash
yarn watch:contract --address MyProtocol --kind protocol --checkpoint true
```

To fill a block range:

```bash
yarn fill --start-block <from-block> --end-block <to-block>
```

* `start-block`: Block number to start filling from.
* `end-block`: Block number till which to fill.

To create a checkpoint for a contract:

```bash
yarn checkpoint create --address <contract-address> --block-hash [block-hash]
```

* `address`: Address or identifier of the contract for which to create a checkpoint.
* `block-hash`: Hash of a block (in the pruned region) at which to create the checkpoint (default: latest canonical block hash).

To reset the watcher to a previous block number:

```bash
yarn reset watcher --block-number <previous-block-number>
```

Reset job-queue:

```bash
yarn reset job-queue
```

Reset state:

```bash
yarn reset state --block-number <previous-block-number>
```

* `block-number`: Block number to which to reset the watcher.

To export and import the watcher state:

In the source watcher, export watcher state:

```bash
yarn export-state --export-file [export-file-path] --block-number [snapshot-block-height]
```

* `export-file`: Path of file to which to export the watcher data.
* `block-number`: Block height at which to take snapshot for export.

In the target watcher, run job-runner:

```bash
yarn job-runner
```

Import watcher state:

```bash
yarn import-state --import-file <import-file-path>
```

* `import-file`: Path of file from which to import the watcher data.

Run server:

```bash
yarn server
```

To inspect a CID:

```bash
yarn inspect-cid --cid <cid>
```

* `cid`: CID to be inspected.
