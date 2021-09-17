# Code Generator

## Setup

* Run the following command to install required packages:

  ```bash
  yarn
  ```

## Run

* Run the following command to generate schema from a contract file:

  ```bash
  yarn codegen:gql --input-file <input-file-path> --output-file [output-file-path] --mode [eth_call | storage] --flatten [true | false]
  ```

    * `input-file`(alias: `i`): Input contract file path or an URL (required).
    * `output-file`(alias: `o`): Schema output file path (logs output using `stdout` if not provided).
    * `mode`(alias: `m`): Code generation mode (default: `storage`).
    * `flatten`(alias: `f`): Flatten the input contract file (default: `true`).

  **Note**: When passed an *URL* as `input-file`, it is assumed that it points to an already flattened contract file.

  Examples:
  
  ```bash
  yarn codegen:gql --input-file ./test/examples/contracts/ERC20.sol --output-file ./ERC20-schema.gql --mode eth_call
  ```

  ```bash
  yarn codegen:gql --input-file https://git.io/Jupci --output-file ./ERC721-schema.gql --mode storage
  ```

## Demo

* Install required packages:

  ```bash
  yarn
  ```

* Generate schema from a contract file:
  
  ```bash
  yarn codegen:gql --input-file ../../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol --output-file ./ERC20-schema.gql --mode storage
  ```

* Generate schema from a flattened contract file from an URL:
  
  ```bash
  yarn codegen:gql --input-file https://git.io/Jupci --output-file ./ERC721-schema.gql --mode eth_call
  ```

## References

* [ERC20 schema generation (eth_call mode).](https://git.io/JuhN2)
* [ERC20 schema generation (storage mode).](https://git.io/JuhNr)
* [ERC721 schema generation (eth_call mode).](https://git.io/JuhNK)
* [ERC721 schema generation (storage mode).](https://git.io/JuhN1)

## Known Issues

* Currently, `node-fetch v2.6.2` is being used to fetch from URLs as `v3.0.0` is an [ESM-only module](https://www.npmjs.com/package/node-fetch#loading-and-configuring-the-module) and `ts-node` transpiles to import  it using `require`. 
