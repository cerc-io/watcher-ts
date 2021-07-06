# Uniswap

## Instructions

### Deploy contracts

```bash
# Create .env.
$ cp .env.example .env
# Set ETH_RPC_URL variable to target chain network.

# Deploy contracts to private network specified by ETH_RPC_URL
$ yarn deploy:factory
# Factory deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3

$ yarn deploy:token --name Token0 --symbol TK0
# token TK0 deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

$ yarn deploy:token --name Token1 --symbol TK1
# token TK1 deployed to: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0

$ yarn create:pool --factory 0x5FbDB2315678afecb367f032d93F642f64180aa3 --token0 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 --token1 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 --fee 500
# Pool deployed to: 0x315244f2680ABa32F27004B67d83E53c8c88F5FE


# For local development.
# Start hardhat local network.
$ yarn hardhat node

# Deploy contracts to local network.
# Deploy contracts to private network specified by ETH_RPC_URL
$ yarn deploy:factory --network localhost
$ yarn deploy:token --network localhost --name Token0 --symbol TK0

```

## Scripts

* **generate:schema**

  Generate schema for uniswap subgraph in graphql format. The `get-graphql-schema` tool is used to generate the schema (https://github.com/prisma-labs/get-graphql-schema). The uniswap subgraph graphql endpoint is provided in the script to generate the schema.

* **lint:schema**

  Lint schema graphql files:

  ```bash
  $ yarn lint:schema schema/frontend.graphql
  ```

* **deploy:factory**

  Deploy Factory contract:

  ```bash
  $ yarn deploy:factory

  # Deploy to hardhat local network.
  $ yarn deploy --network localhost
  ```

* **deploy:token**

  Deploy Token contract:

  ```bash
  $ yarn deploy:token --name TokenName --symbol TKS
  ```

* **create:pool**

  Create pool with factory contract and tokens:

  ```bash
  $ yarn create:pool --factory 0xFactoryAddress --token0 0xToken0Address --token1 0xToken1Address --fee 500
  ```

* **initialize:pool**

  Initialize a pool with price:

  ```bash
  $ yarn initialize:pool --pool 0xPoolAddress --sqrt-price 4295128739
    ```

## References

* https://github.com/Uniswap/uniswap-v3-core
