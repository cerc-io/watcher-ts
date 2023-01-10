# erc721-watcher

First try the [erc721 demo in stack orchestrator](https://github.com/cerc-io/stack-orchestrator/tree/main/app/data/stacks/erc721) to quickly get started. Advanced users can see [here](/docs/README.md) for instructions on setting up a local environment by hand. 

## Setup

Run the following command to install required packages:

```bash
yarn && yarn build
```

If the watcher is "active", first run the job-runner:

```bash
yarn job-runner
```

then run the watcher:

```bash
yarn server
```

For "lazy" watchers, you only need to run the above command.


Deploy an ERC721 token:

```bash
yarn nft:deploy
```
```
# NFT deployed to: 0xNFTAddress
```
Export the address of the deployed token to a shell variable for later use:

```bash
export NFT_ADDRESS="0xNFTAddress"
  ```

Run the following GQL mutation in generated watcher GraphQL endpoint http://127.0.0.1:3006/graphql

```graphql
mutation {
  watchContract(
    address: "0xNFTAddress"
    kind: "ERC721"
    checkpoint: true
  )
}
```

TODO: settle on WC (signer/primary/main...across the docs)

Get the signer (primary/main) account address and export to a shell variable:

```bash
yarn account
```

```bash
export SIGNER_ADDRESS="0xSignerAddress"
```

Connect MetaMask to `http://localhost:8545` (with chain ID `99`)

Add a an account to Metamask and export the account address to a shell variable for later use:

```bash
export RECIPIENT_ADDRESS="0xRecipientAddress"
```

To get the current block hash at any time, run:

```bash
yarn block:latest
```

Run the following GQL query (`eth_call`) in the GraphQL playground at http://127.0.0.1:3006/graphql

```graphql
query {
  name(
    blockHash: "LATEST_BLOCK_HASH"
    contractAddress: "0xNFTAddress"
  ) {
    value
    proof {
      data
    }
  }
  symbol(
    blockHash: "LATEST_BLOCK_HASH"
    contractAddress: "0xNFTAddress"
  ) {
    value
    proof {
      data
    }
  }
  balanceOf(
    blockHash: "LATEST_BLOCK_HASH"
    contractAddress: "0xNFTAddress"
    owner: "0xSignerAddress"
  ) {
    value
    proof {
      data
    }
  }
}
```

Run the following GQL query (`storage`) in generated watcher GraphQL endpoint http://127.0.0.1:3006/graphql

```graphql
query {
  _name(
    blockHash: "LATEST_BLOCK_HASH"
    contractAddress: "0xNFTAddress"
  ) {
    value
    proof {
      data
    }
  }
  _symbol(
    blockHash: "LATEST_BLOCK_HASH"
    contractAddress: "0xNFTAddress"
  ) {
    value
    proof {
      data
    }
  }
  _balances(
    blockHash: "LATEST_BLOCK_HASH"
    contractAddress: "0xNFTAddress"
    key0: "0xSignerAddress"
  ) {
    value
    proof {
      data
    }
  }
}
```

Run the following GQL subscription in the playground:

```graphql
subscription {
  onEvent {
    event {
      __typename
      ... on TransferEvent {
        from
        to
        tokenId
      },
      ... on ApprovalEvent {
        owner
        approved
        tokenId
      }
    },
    block {
      number
      hash
    }
  }
}
```

Mint token

```bash
yarn nft:mint --nft $NFT_ADDRESS --to $SIGNER_ADDRESS --token-id 1
```

- A Transfer event to 0xSignerAddress should be visible in the subscription.

- An auto-generated `diff_staged` `State` should be added with parent CID pointing to the initial `checkpoint` `State`.

- Custom property `transferCount` should be 1 initially.

- Run the `getState` query at the endpoint to get the latest `State` for 0xNFTAddress:

```graphql
query {
  getState (
    blockHash: "EVENT_BLOCK_HASH"
    contractAddress: "0xNFTAddress"
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

- `diff` States get created corresponding to the `diff_staged` blocks when their respective eth_blocks reach the pruned region.

- `data` contains the default state and also the custom state property `transferCount` that is indexed in [hooks.ts](./src/hooks.ts) file.

- Get the latest blockHash and run the following query for `transferCount` entity:

```graphql
query {
  transferCount(
    block: {
      hash: "LATEST_BLOCK_HASH"
    }
    id: "0xNFTAddress"
  ) {
    id
    count
  }
}
```

*Note: Contract address is assigned to the Entity ID.*

With the latest blockHash, run the following query for `balanceOf` and `ownerOf` (`eth_call`):

```graphql
query {
  fromBalanceOf: balanceOf(
    blockHash: "LATEST_BLOCK_HASH"
    contractAddress: "0xNFTAddress"
    owner: "0xSignerAddress"
  ) {
    value
    proof {
      data
    }
  }
  toBalanceOf: balanceOf(
    blockHash: "LATEST_BLOCK_HASH"
    contractAddress: "0xNFTAddress"
    owner: "0xRecipientAddress"
  ) {
    value
    proof {
      data
    }
  }
  ownerOf(
    blockHash: "LATEST_BLOCK_HASH"
    contractAddress: "0xNFTAddress"
    tokenId: 1
  ) {
    value
    proof {
      data
    }
  }
}
```

Transfer token

```bash
yarn nft:transfer --nft $NFT_ADDRESS --from $SIGNER_ADDRESS --to $RECIPIENT_ADDRESS --token-id 1
```

- An Approval event for SIGNER_ADDRESS shall be visible in the subscription at endpoint.

- A Transfer event to $RECIPIENT_ADDRESS shall be visible in the subscription at endpoint.

- An auto-generated `diff_staged` State should be added with parent CID pointing to the previous State.

- Custom property `transferCount` should be incremented after transfer. This can be checked in the `getState` query.

- Get the latest blockHash and replace the blockHash in the above `eth_call` query. The result should be different and the token should be transferred to the recipient.

- Run the `getState` query again at the endpoint with the event blockHash.

- Run the `transferCount` entity query again with the latest blockHash. The updated count should be returned.

- After the `diff` block has been created (can check if event block number pruned in yarn server log), create a checkpoint using CLI in `packages/erc721-watcher`:

```bash
yarn checkpoint create --address $NFT_ADDRESS
```

- Run the `getState` query again with the output blockHash and kind `checkpoint` at the endpoint.

- The latest checkpoint should have the aggregate of state diffs since the last checkpoint.
    - The `State` entries can be seen in pg-admin in table `state`.

- The state should have auto indexed data and also custom property `transferCount` according to code in [hooks](./src/hooks.ts) file `handleEvent` method.

For more `yarn` sub-commands available, see the [CLI guide](/docs/cli.md) 
