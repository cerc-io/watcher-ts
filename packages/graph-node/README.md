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

4. Follow the steps in https://github.com/vulcanize/governance/tree/ng-deploy-contracts#instructions

5. Set the contract addresses for eden contracts in .env file from `deployments/localhost` directory in the governance repository.

   Following are the contracts whose address needs to be set in .env file:

   * EdenNetwork - EDEN_NETWORK_CONTRACT_ADDRESS
   * MerkleDistributor - EDEN_NETWORK_DISTRIBUTION_CONTRACT_ADDRESS
   * DistributorGovernance - EDEN_NETWORK_GOVERNANCE_CONTRACT_ADDRESS

6. Run `yarn build:example` to build the wasm files.

7. Run `yarn test`.
