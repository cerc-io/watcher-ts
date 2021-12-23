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

* Run the following command to generate a watcher from a contract file:

  ```bash
  yarn codegen --input-files <input-file-paths> --contract-names <contract-names> --output-folder [output-folder] --mode [eth_call | storage | all | none] --flatten [true | false] --kind [lazy | active] --port [server-port] --subgraph-path [subgraph-build-path]
  ```

    * `input-files`(alias: `i`): Input contract file path(s) or URL(s) (required).
    * `contract-names`(alias: `c`): Contract name(s) (in order of `input-files`) (required).
    * `output-folder`(alias: `o`): Output folder path. (logs output using `stdout` if not provided).
    * `mode`(alias: `m`): Code generation mode (default: `all`).
    * `flatten`(alias: `f`): Flatten the input contract file (default: `true`).
    * `kind` (alias: `k`): Kind of watcher (default: `active`).
    * `port` (alias: `p`): Server port (default: `3008`).
    * `subgraph-path` (alias: `s`): Path to the subgraph build.

  **Note**: When passed an *URL* in `input-files`, it is assumed that it points to an already flattened contract file.

  Examples:

  Generate code in `storage` mode, `lazy` kind.

  ```bash
  yarn codegen --input-files ./test/examples/contracts/ERC721.sol --contract-names ERC721 --output-folder ../my-erc721-watcher --mode storage --kind lazy
  ```

  Generate code in `eth_call` mode using a contract provided by an URL.

  ```bash
  yarn codegen --input-files https://git.io/Jupci --contract-names ERC721 --output-folder ../my-erc721-watcher --mode eth_call
  ```

  Generate code for `ERC721` in both `eth_call` and `storage` mode, `active` kind.

  ```bash
  yarn codegen --input-files ../../node_modules/@openzeppelin/contracts/token/ERC721/ERC721.sol --contract-names ERC721 --output-folder ../demo-erc721-watcher --mode all --kind active
  ```

  Generate code for `ERC20` contract in both `eth_call` and `storage` mode, `active` kind:

  ```bash
  yarn codegen --input-files ../../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol --contract-names ERC20 --output-folder ../demo-erc20-watcher --mode all --kind active
  ```

  This will create a folder called `demo-erc20-watcher` containing the generated code at the specified path. Follow the steps in [Run Generated Watcher](#run-generated-watcher) to setup and run the generated watcher.

  Generate code for `Eden` contracts in `none` mode, `active` kind:

  ```bash
  yarn codegen --input-files ~/vulcanize/governance/contracts/EdenNetwork.sol ~/vulcanize/governance/contracts/MerkleDistributor.sol ~/vulcanize/governance/contracts/DistributorGovernance.sol --contract-names EdenNetwork MerkleDistributor DistributorGovernance --output-folder ../demo-eden-watcher --mode none --kind active --subgraph-path ~/vulcanize/eden-data/packages/subgraph/build
  ```

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

  * Edit the custom hook function `createInitialCheckpoint` (triggered on watch-contract, checkpoint: `true`) in `src/hooks.ts` to save an initial checkpoint `IPLDBlock` using the `Indexer` object.

  * Edit the custom hook function `createStateDiff` (triggered on a block) in `src/hooks.ts` to save the state in a `diff` `IPLDBlock` using the `Indexer` object. The default state (if exists) is updated.

  * Edit the custom hook function `createStateCheckpoint` (triggered just before default and CLI checkpoint) in `src/hooks.ts` to save the state in a `checkpoint` `IPLDBlock` using the `Indexer` object.

* The existing example hooks in `src/hooks.ts` are for an `ERC20` contract.

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
