# Code Generator

## Setup

* In root of the repository:

  * Install required packages:

    ```bash
    yarn
    ```

  * Build files:

    ```bash
    yarn build
    ```

## Run

* Create a `.yaml` config file in the following format for generating a watcher:

  ```yaml
  # Example config.yaml
  # Contracts to watch (required).
  contracts:
      # Contract name.
    - name: Example
      # Contract file path or an url.
      path: ../graph-node/test/contracts/Example.sol
      # Contract kind (should match that in {subgraphPath}/subgraph.yaml if subgraphPath provided)
      kind: Example1

  # Output folder path (logs output using `stdout` if not provided).
  outputFolder: ../test-watcher

  # Code generation mode [eth_call | storage | all | none] (default: all).
  mode: all

  # Kind of watcher [lazy | active] (default: active).
  kind: active

  # Watcher server port (default: 3008).
  port: 3008

  # Flatten the input contract file(s) [true | false] (default: true).
  flatten: true

  # Path to the subgraph build (optional).
  subgraphPath: ../graph-node/test/subgraph/example1/build

  # NOTE: When passed an *URL* as contract path, it is assumed that it points to an already flattened contract file.
  ```

* Run the following command to generate a watcher from contract(s):

  ```bash
  yarn codegen --config-file <config-file-path>
  ```

  * `config-file`(alias: `c`): Watcher generation config file path (yaml) (required).

  Example:

  * Generate code using a config file `config.yaml`:

    ```bash
    yarn codegen --config-file ./config.yaml
    ```

  This will create a folder containing the generated code at the path provided in config. Follow the steps in [Run Generated Watcher](#run-generated-watcher) to setup and run the generated watcher.

## Run Generated Watcher

### Setup

* Run the following command to install required packages:

  ```bash
  yarn
  ```

* Run the IPFS (go-ipfs version 0.9.0) daemon:

  ```bash
  ipfs daemon
  ```

* In the config file (`environments/local.toml`):

  * Update the state checkpoint settings.

  * Update the IPFS API address in `environments/local.toml`.

* Create the databases configured in `environments/local.toml`.

### Customize

* Indexing on an event:

  * Edit the custom hook function `handleEvent` (triggered on an event) in `src/hooks.ts` to perform corresponding indexing using the `Indexer` object.

  * While using the indexer storage methods for indexing, pass `diff` as true if default state is desired to be generated using the state variables being indexed.

* Generating state:

  * Edit the custom hook function `createInitialState` (triggered if the watcher passes the start block, checkpoint: `true`) in `src/hooks.ts` to save an initial state `IPLDBlock` using the `Indexer` object.

  * Edit the custom hook function `createStateDiff` (triggered on a block) in `src/hooks.ts` to save the state in a `diff` `IPLDBlock` using the `Indexer` object. The default state (if exists) is updated.

  * Edit the custom hook function `createStateCheckpoint` (triggered just before default and CLI checkpoint) in `src/hooks.ts` to save the state in a `checkpoint` `IPLDBlock` using the `Indexer` object.

### Run

* Run lint:

  ```bash
  yarn lint
  ```

* Run the watcher:

  ```bash
  yarn server
  ```

* If the watcher is an `active` watcher:

  * Run the job-runner:

    ```bash
    yarn job-runner
    ```

  * To watch a contract:

    ```bash
    yarn watch:contract --address <contract-address> --kind <contract-kind> --checkpoint <true | false> --starting-block [block-number]
    ```

  * To fill a block range:

    ```bash
    yarn fill --start-block <from-block> --end-block <to-block>
    ```

  * To create a checkpoint for a contract:

    ```bash
    yarn checkpoint --address <contract-address> --block-hash [block-hash]
    ```
  
  * To reset the watcher to a previous block number:

    * Reset state:

      ```bash
      yarn reset state --block-number <previous-block-number>
      ```

    * Reset job-queue:

      ```bash
      yarn reset job-queue --block-number <previous-block-number>
      ```

  * To export the watcher state:

    ```bash
    yarn export-state --export-file [export-file-path]
    ```

  * To import the watcher state:

    ```bash
    yarn import-state --import-file <import-file-path>
    ```
  
  * To inspect a CID:

    ```bash
    yarn inspect-cid --cid <cid>
    ```

## Known Issues

* Currently, `node-fetch v2.6.2` is being used to fetch from URLs as `v3.0.0` is an [ESM-only module](https://www.npmjs.com/package/node-fetch#loading-and-configuring-the-module) and `ts-node` transpiles to import  it using `require`.
