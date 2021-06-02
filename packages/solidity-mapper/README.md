# solidity-mapper

Get value of state variable from storage for a solidity contract.

## Pre-requisites

* NodeJS and NPM

  https://nodejs.org/en/ or use https://github.com/nvm-sh/nvm

## Instructions

Run the tests using the following command
```bash
$ yarn test
```

## Different Types

* [x] Booleans
* [x] Integers
* [ ] Fixed Point Numbers
* [x] Address
* [x] Contract Types
* [x] Fixed-size byte arrays
* [x] Enums
* [ ] Function Types
* [ ] Arrays
* [ ] Dynamically-sized byte array
  * [ ] Bytes
  * [x] String
* [ ] Structs
* [ ] Mapping Types

## Observations

* The storage layouts are formed according to the rules in https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#layout-of-state-variables-in-storage

* Structs can occupy multiple slots depending on the size required by its members.

* Fixed arrays can occupy multiple slots according to the size of the array and the type of array.
