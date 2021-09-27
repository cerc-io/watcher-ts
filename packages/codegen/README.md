# Code Generator

## Setup

* Run the following command to install required packages:

  ```bash
  yarn
  ```

## Run

* Run the following command to generate a watcher from a contract file:

  ```bash
  yarn codegen --input-file <input-file-path> --contract-name <contract-name> --output-folder [output-folder] --mode [eth_call | storage | all] --flatten [true | false]
  ```

    * `input-file`(alias: `i`): Input contract file path or an URL (required).
    * `contract-name`(alias: `c`): Main contract name (required).
    * `output-folder`(alias: `o`): Output folder path. (logs output using `stdout` if not provided).
    * `mode`(alias: `m`): Code generation mode (default: `all`).
    * `flatten`(alias: `f`): Flatten the input contract file (default: `true`).

  **Note**: When passed an *URL* as `input-file`, it is assumed that it points to an already flattened contract file.

  Examples:

  Generate code in both eth_call and storage mode.
  ```bash
  yarn codegen --input-file ./test/examples/contracts/ERC20.sol --contract-name ERC20 --output-folder ../my-erc20-watcher --mode all
  ```

  Generate code in eth_call mode using a contract provided by URL.
  ```bash
  yarn codegen --input-file https://git.io/Jupci --contract-name ERC721 --output-folder ../my-erc721-watcher --mode eth_call
  ```

  Generate code in storage mode.
  ```bash
  yarn codegen --input-file ./test/examples/contracts/ERC721.sol --contract-name ERC721 --output-folder ../my-erc721-watcher --mode storage
  ```

## Demo

* Install required packages:

  ```bash
  yarn
  ```

* Generate a watcher from a contract file:

  ```bash
  yarn codegen --input-file ../../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol --contract-name ERC20 --output-folder ../demo-erc20-watcher --mode eth_call
  ```

  This will create a folder called `demo-erc20-watcher` containing the generated code at the specified path. Follow the steps in `demo-erc20-watcher/README.md` to setup and run the generated watcher.

* Generate a watcher from a flattened contract file from an URL:

  ```bash
  yarn codegen --input-file https://git.io/Jupci --contract-name ERC721 --output-folder ../demo-erc721-watcher --mode eth_call
  ```

## References

* [ERC20 schema generation (eth_call mode).](https://git.io/JuhN2)
* [ERC20 schema generation (storage mode).](https://git.io/JuhNr)
* [ERC721 schema generation (eth_call mode).](https://git.io/JuhNK)
* [ERC721 schema generation (storage mode).](https://git.io/JuhN1)

## Known Issues

* Currently, `node-fetch v2.6.2` is being used to fetch from URLs as `v3.0.0` is an [ESM-only module](https://www.npmjs.com/package/node-fetch#loading-and-configuring-the-module) and `ts-node` transpiles to import  it using `require`.
