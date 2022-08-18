# test

## Setup

* Run the following command to install required packages:

  ```bash
  yarn
  ```

## Test Snapshot

* The snapshot test suite compares results for eth-calls and `getStorageAt` calls to the provided endpoints.

* Contracts considered:
  * UniswapV2 Factory
  * UniswapV2 Pair
  * USDC
  * Compound
  * Dai / Maker

* Edit the [config file](./environments/local.toml):

  Eg:

  ```toml
  blockTag = "0xB5FFFF" # block tag to perform eth-call and getStorageAt call with (eg. block number in hex)

  [endpoints]
    endpoint1 = "https://remote.endpoint" # endpoint1 URL
    endpoint2 = "http://127.0.0.1:8082" # endpoint2 URL
  ```

* Run the following command to run the snapshot test suite:

  ```bash
  yarn test:snapshot
  ```
