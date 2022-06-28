# Demo

* Clone the [stack-orchestrator](https://github.com/vulcanize/stack-orchestrator) repo.

* Checkout the `develop` branch in stack-orchestrator repo.

  ```bash
  git checkout develop
  ```

* Create a `config.sh` file.

  ```bash
  cd stack-orchestrator/helper-scripts
  ./create-config.sh
  ```

* Setup the required repositories.

  ```bash
  ./setup-repositories.sh -p ssh
  ```

* Checkout [v4 release](https://github.com/vulcanize/go-ethereum/releases/tag/v1.10.19-statediff-4.0.3-alpha) in go-ethereum repo. The path for go-ethereum is specified by `vulcanize_go_ethereum` variable in `config.sh` file created in stack-orchestrator repo.

  ```bash
  # In go-ethereum repo.
  git checkout v1.10.19-statediff-4.0.3-alpha
  ```

* To run the stack-orchestrator, the docker-compose version used is:

  ```bash
  docker-compose version
  
  # docker-compose version 1.29.2, build 5becea4c
  ```

* Run the stack-orchestrator

  ```bash
  cd stack-orchestrator/helper-scripts 
  ```

  ```bash
  ./wrapper.sh -f true \
    -m true \
    -s v4 \
    -l latest \
    -v remove \
    -p ../config.sh
  ```

* Create a postgres12 database for the watcher:

  ```bash
  sudo su - postgres
  
  # If database already exists
  # dropdb moby-mask-watcher

  createdb moby-mask-watcher
  ```

* Create database for the job queue and enable the `pgcrypto` extension on them (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

  ```bash
  # If database already exists
  # dropdb moby-mask-watcher-job-queue

  createdb moby-mask-watcher-job-queue
  ```

  ```
  postgres@tesla:~$ psql -U postgres -h localhost moby-mask-watcher-job-queue
  Password for user postgres:
  psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
  SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
  Type "help" for help.

  moby-mask-watcher-job-queue=# CREATE EXTENSION pgcrypto;
  CREATE EXTENSION
  moby-mask-watcher-job-queue=# exit
  ```

* In the [config file](./environments/local.toml) update the `database` connection settings.

* In `graph-watcher` repo, install and build packages:

  ```bash
  yarn && yarn build
  ```

* Change directory to `packages/moby-mask-watcher/` and run the watcher:

  ```bash
  yarn server
  ```

* Clone the [MobyMask](https://github.com/vulcanize/MobyMask) repo.

* Checkout to the branch with changes for using this watcher:

  ```bash
  # In MobyMask repo.
  git checkout ng-use-watcher
  ```

* Run yarn to install the packages

  ```bash
  yarn
  ```

* Deploy the contract:

  ```bash
  cd packages/hardhat

  yarn deploy
  # deploying "PhisherRegistry" (tx: 0xaebeb2e883ece1f679304ec46f5dc61ca74f9e168427268a7dfa8802195b8de0)...: deployed at <MOBY_ADDRESS> with 2306221 gas
  # $ hardhat run scripts/publish.js
  # ✅  Published contracts to the subgraph package.
  # Done in 14.28s.
  ```
  
  Export the address of the deployed contract to a shell variable for later use:

  ```bash
  export MOBY_ADDRESS="<MOBY_ADDRESS>"
  ```

* Update isPhiser and isMember lists with names

  ```bash
  yarn claimPhisher --contract $MOBY_ADDRESS --name phisherName 
  ```

  ```bash
  yarn claimMember --contract $MOBY_ADDRESS --name memberName
  ```

* Check the names in the watcher GraphQL playground http://localhost:3010/graphql

  * Get the latest block

    ```graphql
    query {
      latestBlock {
        hash
        number
      }
    }
    ```

  * Check the `isPhisher` and `isMember` maps

    ```graphql
    query {
      isPhisher(
        blockHash: "LATEST_BLOCK_HASH"
        contractAddress: "MOBY_ADDRESS",
        key0: "phisherName"
      ) {
        value
        proof {
          data
        }
      }
      
      isMember(
        blockHash: "LATEST_BLOCK_HASH"
        contractAddress: "MOBY_ADDRESS",
        key0: "memberName"
      ) {
        value
        proof {
          data
        }
      }
    }
    ```
