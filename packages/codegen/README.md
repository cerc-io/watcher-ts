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
  yarn codegen --input-file <input-file-path> --contract-name <contract-name> --output-folder [output-folder] --mode [eth_call | storage | all] --flatten [true | false] --kind [lazy | active]
  ```

    * `input-file`(alias: `i`): Input contract file path or an URL (required).
    * `contract-name`(alias: `c`): Main contract name (required).
    * `output-folder`(alias: `o`): Output folder path. (logs output using `stdout` if not provided).
    * `mode`(alias: `m`): Code generation mode (default: `all`).
    * `flatten`(alias: `f`): Flatten the input contract file (default: `true`).
    * `kind` (alias: `k`): Kind of watcher (default; `active`).

  **Note**: When passed an *URL* as `input-file`, it is assumed that it points to an already flattened contract file.

  Examples:

  Generate code in both `eth_call` and `storage` mode, `active` kind.

  ```bash
  yarn codegen --input-file ./test/examples/contracts/ERC20.sol --contract-name ERC20 --output-folder ../my-erc20-watcher --mode all --kind active
  ```

  Generate code in `eth_call` mode using a contract provided by an URL.

  ```bash
  yarn codegen --input-file https://git.io/Jupci --contract-name ERC721 --output-folder ../my-erc721-watcher --mode eth_call
  ```

  Generate code in `storage` mode, `lazy` kind.

  ```bash
  yarn codegen --input-file ./test/examples/contracts/ERC721.sol --contract-name ERC721 --output-folder ../my-erc721-watcher --mode storage --kind lazy
  ```

  Generate code for `ERC721` contract in both `eth_call` and `storage` mode, `active` kind:

  ```bash
  yarn codegen --input-file ../../node_modules/@openzeppelin/contracts/token/ERC721/ERC721.sol --contract-name ERC721 --output-folder ../demo-erc721-watcher --mode all --kind active
  ```

  This will create a folder called `demo-erc721-watcher` containing the generated code at the specified path. Follow the steps in [Run Generated Watcher](#run-generated-watcher) to setup and run the generated watcher.

## Run Generated Watcher

### Setup

* Run the following command to install required packages:

  ```bash
  yarn
  ```

* Create the databases configured in `environments/local.toml`.

### Customize

* Indexing on an event:

  * Edit the custom hook function `handleEvent` (triggered on an event) in `src/hooks.ts` to perform corresponding indexing using the `Indexer` object.

  * Refer to `src/hooks.example.ts` for an example hook function for events in an ERC20 contract.

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
    yarn watch:contract --address <contract-address> --kind ERC721 --starting-block [block-number]
    ```

  * To fill a block range:

    ```bash
    yarn fill --startBlock <from-block> --endBlock <to-block>
    ```

## Known Issues

* Currently, `node-fetch v2.6.2` is being used to fetch from URLs as `v3.0.0` is an [ESM-only module](https://www.npmjs.com/package/node-fetch#loading-and-configuring-the-module) and `ts-node` transpiles to import  it using `require`.
