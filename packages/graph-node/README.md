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
  
  * Specify the GQL two endpoints in the endpoints config in [config-file](./src/cli/compare/config.toml)

    Example:

    ```
    [endpoints]
      gqlEndpoint1 = "http://127.0.0.1:3008/graphql"
      gqlEndpoint2 = "http://127.0.0.1:3009/graphql"
    ```
  
    Or pass the path to config file as an arg. to the CLI.
  
  * Add the GQL query files to the [queries-folder](./src/cli/compare/queries)

  * Fire a query and get the diff of the results from the two GQL endpoints:

    ```bash
    yarn compare-entity --config-file [config-file-path] --query-name <query-name> --block-hash <block-hash> --entity-id <entity-id> --raw-json [true | false]
    ```

    * `config-file`(alias: `f`): Configuration file path (toml) (default: `./src/cli/compare/config.toml`).
    * `query-name`(alias: `q`): Query to be fired (required).
    * `block-hash`(alias: `b`): Block hash (required).
    * `entity-id`(alias: `i`): Entity Id (required).
    * `raw-json`(alias: `j`): Whether to print out a raw diff object (default: `false`).
  
  * The program will exit with code `1` if the query results are not equal.
