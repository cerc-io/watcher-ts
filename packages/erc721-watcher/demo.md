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
  # dropdb erc721-watcher

  createdb erc721-watcher
  ```

* Create database for the job queue and enable the `pgcrypto` extension on them (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

  ```bash
  # If database already exists
  # dropdb erc721-watcher-job-queue

  createdb erc721-watcher-job-queue
  ```

  ```
  postgres@tesla:~$ psql -U postgres -h localhost erc721-watcher-job-queue
  Password for user postgres:
  psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
  SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
  Type "help" for help.

  erc721-watcher-job-queue=# CREATE EXTENSION pgcrypto;
  CREATE EXTENSION
  erc721-watcher-job-queue=# exit
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

* Get the signer account address and export to a shell variable:

  ```bash
  yarn account
  ```

  ```bash
  export SIGNER_ADDRESS="<SIGNER_ADDRESS>"
  ```

* Connect MetaMask to `http://localhost:8545` (with chain ID `99`)

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
      owner: "SIGNER_ADDRESS"
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
      key0: "SIGNER_ADDRESS"
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
  yarn nft:mint --nft $NFT_ADDRESS --to $SIGNER_ADDRESS --token-id 1
  ```

  * A Transfer event to SIGNER_ADDRESS shall be visible in the subscription at endpoint.

  * An auto-generated `diff_staged` `State` should be added with parent CID pointing to the initial `checkpoint` `State`.

  * Custom property `transferCount` should be 1 initially.

* Run the `getState` query at the endpoint to get the latest `State` for NFT_ADDRESS:

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

  * `diff` States get created corresponding to the `diff_staged` blocks when their respective eth_blocks reach the pruned region.

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
      owner: "SIGNER_ADDRESS"
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
  yarn nft:transfer --nft $NFT_ADDRESS --from $SIGNER_ADDRESS --to $RECIPIENT_ADDRESS --token-id 1
  ```

  * An Approval event for SIGNER_ADDRESS shall be visible in the subscription at endpoint.

  * A Transfer event to $RECIPIENT_ADDRESS shall be visible in the subscription at endpoint.

  * An auto-generated `diff_staged` State should be added with parent CID pointing to the previous State.

  * Custom property `transferCount` should be incremented after transfer. This can be checked in the `getState` query.

* Get the latest blockHash and replace the blockHash in the above `eth_call` query. The result should be different and the token should be transferred to the recipient.

* Run the `getState` query again at the endpoint with the event blockHash.

* Run the `transferCount` entity query again with the latest blockHash. The updated count should be returned.

* After the `diff` block has been created (can check if event block number pruned in yarn server log), create a checkpoint using CLI in `packages/erc721-watcher`:

  ```bash
  yarn checkpoint create --address $NFT_ADDRESS
  ```

  * Run the `getState` query again with the output blockHash and kind `checkpoint` at the endpoint.

  * The latest checkpoint should have the aggregate of state diffs since the last checkpoint.

  * The `State` entries can be seen in pg-admin in table `state`.

* The state should have auto indexed data and also custom property `transferCount` according to code in [hooks](./src/hooks.ts) file `handleEvent` method.
