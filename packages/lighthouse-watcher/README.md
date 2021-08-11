# Lighthouse Watcher

## Setup

Deploy a Lighthouse contract:

```bash
yarn lighthouse:deploy
```

Use the Lighthouse contract address and set `environments/local.toml` to watch the contract.

```toml
[watch]
  lighthouse = "0xLighthouseContractAddress"
```

## Run

Run the server:

```bash
$ yarn server
```

## Test

To test the watcher locally:

Open graphql playground at http://127.0.0.1:3005/graphql and set a subscription query

```graphql
subscription {
  onEvent {
    block {
      hash
      number
      timestamp
    }
    tx {
      hash
    }
    contract
    eventIndex
    event {
      __typename
      ... on StorageRequestEvent {
        uploader
        cid
        config
        fileCost
      }
    }
    proof {
      data
    }
  }
}
```

To trigger StorageRequest event locally, run:

```bash
yarn lighthouse:store --lighthouse 0xLighthouseContractAddress --cid testCid --store-config testConfig --file-cost 10
```

### Smoke test

To run a smoke test:

* Start the server.
 
* Run:

  ```bash
  $ yarn smoke-test
  ```
