# Subgraph watcher demo

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

* In [packages/codegen](./), create a `config.yaml` file:

  ```yaml
  # Config to generate demo-erc721-watcher using codegen.
  # Contracts to watch (required).
  contracts:
      # Contract name.
    - name: ERC721
      # Contract file path or an url.
      path: ../../node_modules/@openzeppelin/contracts/token/ERC721/ERC721.sol
      # Contract kind
      kind: ERC721

  # Output folder path (logs output using `stdout` if not provided).
  outputFolder: ../demo-erc721-watcher

  # Code generation mode [eth_call | storage | all | none] (default: none).
  mode: all

  # Kind of watcher [lazy | active] (default: active).
  kind: active

  # Watcher server port (default: 3008).
  port: 3009

  # Flatten the input contract file(s) [true | false] (default: true).
  flatten: true
  ```

* Run codegen to generate watcher:

  ```bash
  yarn codegen --config-file ./config.yaml
  ```

  The watcher should be generated in `packages/demo-erc721-watcher`

* Create a postgres12 database for the watcher:

  ```bash
  sudo su - postgres

  # If database already exists
  # dropdb demo-erc721-watcher

  createdb demo-erc721-watcher
  ```

* Create database for the job queue and enable the `pgcrypto` extension on them (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

  ```bash
  # If database already exists
  # dropdb demo-erc721-watcher-job-queue

  createdb demo-erc721-watcher-job-queue
  ```

  ```
  postgres@tesla:~$ psql -U postgres -h localhost demo-erc721-watcher-job-queue
  Password for user postgres:
  psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
  SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
  Type "help" for help.

  demo-erc721-watcher-job-queue=# CREATE EXTENSION pgcrypto;
  CREATE EXTENSION
  demo-erc721-watcher-job-queue=# exit
  ```

## Custom hooks:

For generating default state for `ERC721` from the indexer methods, replace the `handleEvent` hook in `demo-erc721-watcher/src/hooks.ts` file with:

```ts
export async function handleEvent (indexer: Indexer, eventData: ResultEvent): Promise<void> {
  assert(indexer);
  assert(eventData);

  // Perform indexing based on the type of event.
  switch (eventData.event.__typename) {
    case 'TransferEvent': {
      // Get event fields from eventData.
      const { from, to, tokenId } = eventData.event;

      // Update balance entry for the sender in database.
      if (from !== '0x0000000000000000000000000000000000000000') {
        await indexer._balances(eventData.block.hash, eventData.contract, from, true);
      }

      // Update balance entry for the receiver in database.
      if (to !== '0x0000000000000000000000000000000000000000') {
        await indexer._balances(eventData.block.hash, eventData.contract, to, true);
      }

      // Update owner for the tokenId in database.
      await indexer._owners(eventData.block.hash, eventData.contract, tokenId, true);

      break;
    }
    case 'ApprovalEvent': {
      // Get event fields from eventData.
      const { tokenId } = eventData.event;

      // Update tokenApprovals for the tokenId in database.
      await indexer._tokenApprovals(eventData.block.hash, eventData.contract, tokenId, true);

      break;
    }
    case 'ApprovalForAllEvent': {
      // Get event fields from eventData.
      const { owner, operator } = eventData.event;

      // Update operatorApprovals for the tokenId in database.
      await indexer._operatorApprovals(eventData.block.hash, eventData.contract, owner, operator, true);

      break;
    }
  }
}
```

  Here, the `diff` is passed as true to indexer methods to store default state.

* In `watcher-ts` repo, follow the instructions in [Setup](../../README.md#setup) for installing and building packages.

  ```bash
  # After setup
  yarn && yarn build
  ```

* In `packages/demo-erc721-watcher`, run the job-runner:

  ```bash
  yarn job-runner
  ```

* Run the watcher:

  ```bash
  yarn server
  ```

## Operations

Run the following in [packages/erc721-watcher](../erc721-watcher/):

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

* Deploy token:

  ```bash
  yarn nft:deploy
  ```

* Set the returned address to the variable `$NFT_ADDRESS`:

  ```bash
  NFT_ADDRESS=<NFT_ADDRESS>
  ```

* Run the following GQL mutation in generated watcher graphql endpoint http://127.0.0.1:3009/graphql

  ```graphql
  mutation {
    watchContract(
      address: "NFT_ADDRESS"
      kind: "ERC721"
      checkpoint: true
    )
  }
  ```

* Run the following GQL subscription in generated watcher graphql endpoint:

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

* Mint token:

  ```bash
  yarn nft:mint --nft $NFT_ADDRESS --to $SIGNER_ADDRESS --token-id 1
  ```

  * A `Transfer` event to `$SIGNER_ADDRESS` shall be visible in the subscription at endpoint.

  * An auto-generated `diff` entry `State` should be added with `parent` cid pointing to the initial checkpoint `State`.

* Run the `getState` query at the endpoint to get the latest `State` for `NFT_ADDRESS`:

  ```graphql
  query {
    getState (
      blockHash: "EVENT_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      # kind: "checkpoint"
      kind: "diff"
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

* Transfer token:

  ```bash
  yarn nft:transfer --nft $NFT_ADDRESS --from $SIGNER_ADDRESS --to $RECIPIENT_ADDRESS --token-id 1
  ```
  
  * An `Approval` event for `ZERO_ADDRESS` shall be visible in the subscription at endpoint.
  
  * A `Transfer` event to `$RECIPIENT_ADDRESS` shall be visible in the subscription at endpoint.

  * An auto-generated `diff` entry `State` should be added with `parent` cid pointing to the previous `State`.

* Run the `getState` query again at the endpoint with event blockHash.

* Get the latest `blockHash`:

  ```bash
  yarn block:latest
  ```

* In `packages/demo-erc721-watcher`, create a checkpoint using CLI:

  ```bash
  yarn checkpoint create --address $NFT_ADDRESS
  ```

  * Run the `getState` query again with the output blockHash and kind `checkpoint` at the endpoint.

  * The latest checkpoint should have the aggregate of state diffs since the last checkpoint.
  
  * The `State` entries can be seen in `pg-admin` in table `state`.
