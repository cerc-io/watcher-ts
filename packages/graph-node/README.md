# graph-node

## Test

1. Run `yarn` to install all dependencies.

2. Create .env file

   ```bash
   $ cp .env.example .env
   ```

3. Run `yarn build:example` to build the wasm files.

4. Run `yarn test`.

## Run

* Compare query results from two different GQL endpoints:

  * In a config file (sample: `environments/compare-cli-config.toml`):

    * Specify the two GQL endpoints in the endpoints config.

    * Specify the query directory in queries config or pass as an arg. to the CLI.

    * Example:

        ```
        [endpoints]
          gqlEndpoint1 = "http://localhost:8000/subgraphs/name/example1"
          gqlEndpoint2 = "http://localhost:3008/graphql"

        [queries]
          queryDir = "../graph-test-watcher/src/gql/queries"
        ```

  * Fire a query and get the diff of the results from the two GQL endpoints:

      ```bash
      ./bin/compare-entity --config-file <config-file-path> --query-dir [query-dir] --query-name <query-name> --block-hash <block-hash> --entity-id <entity-id> --raw-json [true | false]
      ```

      * `config-file`(alias: `cf`): Configuration file path (toml) (required).
      * `query-dir`(alias: `qf`): Path to queries directory (defualt: taken from the config file).
      * `query-name`(alias: `q`): Query to be fired (required).
      * `block-hash`(alias: `b`): Block hash (required).
      * `entity-id`(alias: `i`): Entity Id (required).
      * `raw-json`(alias: `j`): Whether to print out a raw diff object (default: `false`).

      Example:

        ```bash
        ./bin/compare-entity --config-file environments/compare-cli-config.toml --query-name author --block-hash 0xceed7ee9d3de97c99db12e42433cae9115bb311c516558539fb7114fa17d545b --entity-id 0xdc7d7a8920c8eecc098da5b7522a5f31509b5bfc
        ```

  * The program will exit with code `1` if the query results are not equal.

  * For comparing queries in a range of blocks:

    * Config file should have the names of queries to be fired.

      ```toml
      [queries]
        queryDir = "../graph-test-watcher/src/gql/queries"
        names = [
          "author",
          "blog"
        ]
      ```
    
    * Run the CLI:

      ```bash
      ./bin/compare-blocks --config-file environments/compare-cli-config.toml --start-block 1 --end-block 10
      ```
    
    * For comparing entities after fetching ids from one of the endpoints and then querying individually by ids:

      * Set the `idsEndpoint` to choose which endpoint the ids should be fetched from.

        ```toml
        [endpoints]
          gqlEndpoint1 = "http://localhost:8000/subgraphs/name/example1"
          gqlEndpoint2 = "http://localhost:3008/graphql"

        [queries]
          queryDir = "../graph-test-watcher/src/gql/queries"
          names = [
            "author",
            "blog"
          ]
          idsEndpoint = "gqlEndpoint1"
        ```
      
      * Run the CLI with `fetch-ids` flag set to true:\

        ```bash
        ./bin/compare-blocks --config-file environments/compare-cli-config.toml --start-block 1 --end-block 10 --fetch-ids
        ```
