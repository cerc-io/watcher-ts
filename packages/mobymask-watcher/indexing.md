# Index missing blocks with eth-statediff-service

This readme can be followed to index required blocks out of order for a contract. This indexed data can then be used by the watcher further.

* For indexing the required blocks the following core services will be used:

  * [ipld-eth-db](https://github.com/vulcanize/ipld-eth-db)

    * Run ipld-eth-db database using docker:

      ```bash
      docker-compose -f docker-compose.yml up
      ```
    
  * [leveldb-ethdb-rpc](https://github.com/vulcanize/leveldb-ethdb-rpc)

    It is an RPC wrapper around LevelDB. The endpoint can be used by eth-statediff-service to access LevelDB.

  * [eth-statediff-service](https://github.com/vulcanize/eth-statediff-service)

    * The [config file](https://github.com/vulcanize/eth-statediff-service/blob/sharding/environments/config.toml) can be updated with the following for running eth-statediff-service:

      ```toml
      [leveldb]
        mode = "remote"
        # leveldb-ethdb-rpc endpoint
        url = "http://127.0.0.1:8082/"

      [server]
        httpPath = "0.0.0.0:8545"

      [statediff]
        prerun = false
        serviceWorkers = 2
        workerQueueSize = 1024
        trieWorkers = 16

      [log]
        level = "info"

      [database]
        # Credentials for ipld-eth-db database
        name     = "vulcanize_testing"
        hostname = "localhost"
        port     = 8077
        user     = "vdbm"
        password = "password"
        type = "postgres"
        driver = "sqlx"

      [cache]
        database = 1024
        trie = 4096

      [ethereum]
        # Config for mainnet
        nodeID = "1"
        clientName = "eth-statediff-service"
        networkID = 1
        chainID = 1
      ```

    * Run eth-statediff-service:

      ```bash
      make build && ./eth-statediff-service serve --config environments/config.toml
      ```
  
* Indexing required blocks can be done in the following way:

  * Call `writeStateDiffAt` API with watched addresses for required blocks:

    ```bash
    # Replace $BLOCK_NUMBER with required block number to index and $CONTRACT_ADDRESS with the contract of interest.
    curl -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"statediff_writeStateDiffAt","params":[$BLOCK_NUMBER, {"intermediateStateNodes":true,"intermediateStorageNodes":true,"includeBlock":true,"includeReceipts":true,"includeTD":true,"includeCode":true,"watchedAddresses":["$CONTRACT_ADDRESS"]}],"id":1}' "127.0.0.1":"8545"
    ```

    After successfully completing writeStateDiffAt for a block the returned response is:

    ```bash
    curl: (52) Empty reply from server
    ```

    **NOTE**: Using remote leveldb-ethdb-rpc takes long time (6-20 minutes).

  * Stop the eth-statediff-service after all required blocks are indexed.

* Start the [ipld-eth-server](https://github.com/vulcanize/eth-statediff-service) to query the indexed data from watcher.

  * Create the following config.toml file for ipld-eth-server in [environments directory](https://github.com/vulcanize/ipld-eth-server/tree/sharding/environments):

    ```toml
    [database]
      # Credentials for ipld-eth-db database
      name     = "vulcanize_testing" # $DATABASE_NAME
      hostname = "localhost" # $DATABASE_HOSTNAME
      port     = 8077 # $DATABASE_PORT
      user     = "vdbm" # $DATABASE_USER
      password = "password" # $DATABASE_PASSWORD

    [log]
      level = "info" # $LOGRUS_LEVEL

    [ethereum]
      # Config for mainnet
      chainID = "1" # $ETH_CHAIN_ID
      nodeID = "arch1" # $ETH_NODE_ID
      clientName = "Geth" # $ETH_CLIENT_NAME
      networkID = "1" # $ETH_NETWORK_ID
    ```
  
  * Run the server with the config above:

    ```bash
    make build && ./ipld-eth-server serve --config=./environments/config.toml --eth-server-graphql --log-level info
    ```

* The following steps are for indexing blocks out of order in the watcher:

  * Follow [steps in the readme](./README.md#setup) to setup the watcher.

  * Watch the contract:

    ```bash
    # Replace $CONTRACT_ADDRESS and $CONTRACT_NAME witch actual values
    yarn watch:contract --address $CONTRACT_ADDRESS --kind $CONTRACT_NAME --checkpoint true
    ```

  * Index the required blocks. They should be the same blocks indexed by eth-statediff-service above.

    ```bash
    # Replace $BLOCK_NUMBER with required block number to index
    yarn index-block --block $BLOCK_NUMBER
    ```
  
  * Check the `event` and `block_progress` table to confirm that the required blocks have been indexed properly.

  * The watcher can be started in lazy mode:

    * Update `server.kind` in [config](./environments/local.toml):

      ```toml
      [server]
        kind = "lazy"
      ```

    * Run server:

      ```bash
      yarn server
      ```
