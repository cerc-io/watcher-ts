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

* Checkout [v4 release](https://github.com/vulcanize/go-ethereum/releases/tag/v1.10.19-statediff-4.0.2-alpha) in go-ethereum repo. The path for go-ethereum is specified by `vulcanize_go_ethereum` variable in `config.sh` file created in stack-orchestrator repo.

  ```bash
  # In go-ethereum repo.
  git checkout v1.10.19-statediff-4.0.2-alpha
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

* Run the IPFS (go-ipfs version 0.12.2) daemon:

  ```bash
  ipfs daemon

  # API server listening on /ip4/127.0.0.1/tcp/5001
  ```
  The IPFS API address can be seen in the output.

* In the [config file](./environments/local.toml) update the `server.ipfsApiAddr` config with the IPFS API address.

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

  * An auto-generated `diff_staged` IPLDBlock should be added with parent CID pointing to the previous IPLDBlock.

  * Custom property `transferCount` should be incremented after transfer. This can be checked in the `getState` query and in IPFS webUI mentioned in the later steps.

* Get the latest blockHash and replace the blockHash in the above `eth_call` query. The result should be different and the token should be transferred to the recipient.

* Run the `getState` query again at the endpoint with the event blockHash.

* Run the `transferCount` entity query again with the latest blockHash. The updated count should be returned.

* After the `diff` block has been created (can check if event block number pruned in yarn server log), create a checkpoint using CLI in `packages/erc721-watcher`:

  ```bash
  yarn checkpoint create --address $NFT_ADDRESS
  ```

  * Run the `getState` query again with the output blockHash and kind `checkpoint` at the endpoint.

  * The latest checkpoint should have the aggregate of state diffs since the last checkpoint.

  * The IPLDBlock entries can be seen in pg-admin in table ipld_block.

* All the diff and checkpoint IPLDBlocks should pushed to IPFS.

* Open IPFS WebUI http://127.0.0.1:5001/webui and search for IPLDBlocks using their CIDs.

* The state should have auto indexed data and also custom property `transferCount` according to code in [hooks](./src/hooks.ts) file `handleEvent` method.

## Reset / Clean up

* To close down services in stack-orchestrator, hit `ctrl + c` in the terminal where it was run.

* To stop and remove stack-orchestrator services running in background run:

  ```bash
  cd stack-orchestrator

  docker-compose -f ./docker/latest/docker-compose-db-sharding.yml down -v --remove-orphans
  ```
