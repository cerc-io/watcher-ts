# graph-node

## Test

1. Run `yarn` to install all dependencies.

2. Create .env file

   ```bash
   $ cp .env.example .env
   ```

3. To deploy contract for example subgraph use https://github.com/deep-stack/eth-contract-tests

   ```bash
   # In eth-contract-test repo.
   $ yarn

   $ yarn example:deploy
   ```

   Use the address the contract got deployed to and set it to `EXAMPLE_CONTRACT_ADDRESS` in .env file.

3. To deploy contracts for eden subgraph use https://github.com/vulcanize/governance

4. Follow the steps in https://github.com/vulcanize/governance/tree/watcher-ts#instructions

5. Set the contract addresses for eden contracts in .env file from `deployments/localhost` directory in the governance repository.

   Following are the contracts whose address needs to be set in .env file:

   * EdenNetwork - EDEN_NETWORK_CONTRACT_ADDRESS
   * MerkleDistributor - EDEN_NETWORK_DISTRIBUTION_CONTRACT_ADDRESS
   * DistributorGovernance - EDEN_NETWORK_GOVERNANCE_CONTRACT_ADDRESS

6. Run `yarn build:example` to build the wasm files.

7. Run `yarn test`.

## Run

* Compare query results from two different GQL endpoints:
  
  * In a config file (sample: `environments/compare-cli-config.toml`):

    * Specify the two GQL endpoints in the endpoints config.

    * Specify the query directory in queries config or pass as an arg. to the CLI.

    * Example:

        ```
        [endpoints]
          gqlEndpoint1 = "http://127.0.0.1:3008/graphql"
          gqlEndpoint2 = "http://127.0.0.1:3009/graphql"
        
        [queries]
        queryDir = "../graph-test-watcher/src/gql/queries"
        ```

  * Fire a query and get the diff of the results from the two GQL endpoints:

      ```bash
      yarn compare-entity --config-file <config-file-path> --query-dir [query-dir] --query-name <query-name> --block-hash <block-hash> --entity-id <entity-id> --raw-json [true | false]
      ```

      * `config-file`(alias: `cf`): Configuration file path (toml) (required).
      * `query-dir`(alias: `qf`): Path to queries directory (defualt: taken from the config file).
      * `query-name`(alias: `q`): Query to be fired (required).
      * `block-hash`(alias: `b`): Block hash (required).
      * `entity-id`(alias: `i`): Entity Id (required).
      * `raw-json`(alias: `j`): Whether to print out a raw diff object (default: `false`).
    
    * Example:

        ```bash
        yarn compare-entity --config-file environments/compare-cli-config.toml --query-name exampleEntity --block-hash 0xceed7ee9d3de97c99db12e42433cae9115bb311c516558539fb7114fa17d545b --entity-id 0x2886bae64814bd959aec4282f86f3a97bf1e16e4111b39fd7bdd592b516c66c6
        ```
  
  * The program will exit with code `1` if the query results are not equal.
