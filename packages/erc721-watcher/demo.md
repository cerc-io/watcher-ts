# Demo

* For setup follow the [steps in Readme](./README.md#setup).

* Run the watcher:

  ```bash
  yarn server
  ```

* Run the job-runner:

  ```bash
  yarn job-runner
  ```

* Deploy an ERC721 token:

  ```bash
  yarn nft:deploy
  # NFT deployed to: NFT_ADDRESS
  ```

  Export the address of the deployed token to a shell variable for later use:

  ```bash
  export NFT_ADDRESS="<NFT_ADDRESS>"
  ```

* Run the following GQL mutation in generated watcher GraphQL endpoint http://127.0.0.1:3006/graphql

  ```graphql
  mutation {
    watchContract(
      address: "NFT_ADDRESS"
      kind: "ERC721"
      checkpoint: true
    )
  }
  ```

* Connect MetaMask to `http://localhost:8545` (with chain ID `41337`)

* Add a second account to Metamask and export the account address to a shell variable for later use:

  ```bash
  export RECIPIENT_ADDRESS="<RECIPIENT_ADDRESS>"
  ```

* To get the current block hash at any time, run:

  ```bash
  yarn block:latest
  ```

* Run the following GQL query (`eth_call`) in generated watcher GraphQL endpoint http://127.0.0.1:3006/graphql

  ```graphql
  query {
    name(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
    symbol(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
    balanceOf(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      owner: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc"
    ) {
      value
      proof {
        data
      }
    }
  }
  ```

* Run the following GQL query (`storage`) in generated watcher GraphQL endpoint http://127.0.0.1:3006/graphql

  ```graphql
  query {
    _name(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
    _symbol(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
    _balances(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      key0: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc"
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

* Mint token

  ```bash
  yarn nft:mint --nft $NFT_ADDRESS --to 0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc --token-id 1
  ```

  * A Transfer event to 0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc shall be visible in the subscription at endpoint.

  * An auto-generated `diff_staged` IPLDBlock should be added with parent CID pointing to the initial checkpoint IPLDBlock.

  * Custom property `transferCount` should be 1 initially.

* Run the `getState` query at the endpoint to get the latest IPLDBlock for NFT_ADDRESS:

  ```graphql
  query {
    getState (
      blockHash: "EVENT_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
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

  * `diff` IPLDBlocks get created corresponding to the `diff_staged` blocks when their respective eth_blocks reach the pruned region.

  * `data` contains the default state and also the custom state property `transferCount` that is indexed in [hooks.ts](./src/hooks.ts) file.

* Get the latest blockHash and run the following query for `transferCount` entity:

  ```graphql
  query {
    transferCount(
      block: {
        hash: "LATEST_BLOCK_HASH"
      }
      id: "NFT_ADDRESS"
    ) {
      id
      count
    }
  }
  ```

  *Note: Contract address is assigned to the Entity ID.*

* With the latest blockHash, run the following query for `balanceOf` and `ownerOf` (`eth_call`):

  ```graphql
  query {
    fromBalanceOf: balanceOf(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      owner: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc"
    ) {
      value
      proof {
        data
      }
    }
    toBalanceOf: balanceOf(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      owner: "RECIPIENT_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
    ownerOf(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      tokenId: 1
    ) {
      value
      proof {
        data
      }
    }
  }
  ```

* Transfer token

  ```bash
  yarn nft:transfer --nft $NFT_ADDRESS --from 0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc --to $RECIPIENT_ADDRESS --token-id 1
  ```

  * An Approval event for ZERO_ADDRESS (0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc) shall be visible in the subscription at endpoint.

  * A Transfer event to $RECIPIENT_ADDRESS shall be visible in the subscription at endpoint.

  * An auto-generated `diff_staged` IPLDBlock should be added with parent CID pointing to the previous IPLDBlock.

  * Custom property `transferCount` should be incremented after transfer. This can be checked in the `getState` query and in IPFS webUI mentioned in the later steps.

* Get the latest blockHash and replace the blockHash in the above `eth_call` query. The result should be different and the token should be transferred to the recipient.

* Run the `getState` query again at the endpoint with the event blockHash.

* Run the `transferCount` entity query again with the latest blockHash. The updated count should be returned.

* After the `diff` block has been created (can check if event block number pruned in yarn server log), create a checkpoint using CLI in `packages/erc721-watcher`:

  ```bash
  yarn checkpoint --address $NFT_ADDRESS
  ```

  * Run the `getState` query again with the output blockHash and kind checkpoint at the endpoint.

  * The latest checkpoint should have the aggregate of state diffs since the last checkpoint.

  * The IPLDBlock entries can be seen in pg-admin in table ipld_block.

* All the diff and checkpoint IPLDBlocks should pushed to IPFS.

* Open IPFS WebUI http://127.0.0.1:5001/webui and search for IPLDBlocks using their CIDs.

* The state should have auto indexed data and also custom property `transferCount` according to code in [hooks](./src/hooks.ts) file `handleEvent` method.
