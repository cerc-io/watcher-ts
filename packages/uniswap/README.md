# Uniswap

## Scripts

* **generate:schema**

  Generate schema for uniswap subgraph in graphql format. The `get-graphql-schema` tool is used to generate the schema (https://github.com/prisma-labs/get-graphql-schema). The uniswap subgraph graphql endpoint is provided in the script to generate the schema.

* **lint:schema**

  Lint schema graphql files.
  ```bash
  $ yarn lint:schema schema/frontend.graphql
  ```

## References

* https://github.com/Uniswap/uniswap-v3-core
