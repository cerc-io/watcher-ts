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
    endpoint1 = "http://127.0.0.1:8545" # endpoint1 URL
    endpoint2 = "http://127.0.0.1:8082" # endpoint2 URL
  ```

* Run the following command to run the snapshot test suite:

  ```bash
  yarn test:snapshot
  ```

## Individual Calls

* Run the following to make an eth-call:

  ```bash
  yarn eth-call -e <endpoint> -c <contract> -a <abi> -m <method-name> --method-args [method-args] -b [block-tag]
  ```

  * `endpoint` (`e`): Endpoint to perform eth-call against
  * `contract` (`c`): Contract address
  * `abi` (`a`): Contract ABI path
  * `method-name` (`m`): Contract method to call
  * `method-args`: Contract method arguments
  * `block-tag` (`b`): Block tag to make eth-call with (block number (hex) / block hash)

    Eg.

      ```bash
      yarn eth-call -e http://127.0.0.1:8545 -c 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f -a abis/UniswapV2Factory.json -m allPairs --method-args 100 -b 0xB5FFFF
      ```

* Run the following to make a `getStorageAt` call:

  ```bash
  yarn get-storage-at -e <endpoint> -c <contract> -s <slot> -b [block-tag]
  ```

  * `endpoint` (`e`): Endpoint to perform getStorageAt call against
  * `contract` (`c`): Contract address
  * `slot` (`s`): Storge slot
  * `block-tag` (`b`): Block tag to make getStorageAt call with (block number (hex) / block hash)

    Eg.

      ```bash
      yarn get-storage-at -e http://127.0.0.1:8545 -c 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f -s 0x1 -b 0xB5FFFF
      ```
