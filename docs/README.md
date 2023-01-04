# Watcher Documentation

## Setting up without Stack Orchestrator

- requries the three services
- setup postgres (incl. PG crypto)
- then demo each watcher

## Setup

* Create a postgres12 database for the watcher:

  ```bash
  sudo su - postgres

  # If database already exists
  # dropdb erc20-watcher

  createdb erc20-watcher
  ```

Create a postgres12 database for the job queue:

```
sudo su - postgres
createdb erc20-watcher-job-queue
```

Enable the `pgcrypto` extension on the job queue database (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro).

Example:

```
postgres@tesla:~$ psql -U postgres -h localhost erc20-watcher-job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

erc20-watcher-job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
erc20-watcher-job-queue=# exit
```

Create a postgres12 database for the erc20 watcher:

```
sudo su - postgres
createdb erc20-watcher
```

Update `environments/local.toml` with database connection settings for both the databases.
```toml
[database]
  type = "postgres"
  host = "localhost"
  port = 5432
  database = "erc20-watcher"
  username = "postgres"
  password = "postgres"

[jobQueue]
  dbConnectionString = "postgres://postgres:postgres@localhost/erc20-watcher-job-queue"
```

Update the `upstream` config in `environments/local.toml`. Provide the `ipld-eth-server` GQL and RPC API endpoints.
```toml
[upstream]
  [upstream.ethServer]
    gqlApiEndpoint = "http://127.0.0.1:8082/graphql"
    rpcProviderEndpoint = "http://127.0.0.1:8081"
```

Ensure that watcher is of active kind. Update the kind in `server` config to active.
```toml
[server]
  kind = "active"
```


### ERC721
 
* Create a postgres12 database for the watcher:

  ```bash
  sudo su - postgres
  createdb erc721-watcher
  ```

* If the watcher is an `active` watcher:

  Create database for the job queue and enable the `pgcrypto` extension on them (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

  ```
  createdb erc721-watcher-job-queue
  ```

  ```
  postgres@tesla:~$ psql -U postgres -h localhost erc721-watcher-job-queue
  Password for user postgres:
  psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
  SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
  Type "help" for help.

  erc721-watcher-job-queue=# CREATE EXTENSION pgcrypto;
  CREATE EXTENSION
  erc721-watcher-job-queue=# exit
  ```

* The following core services should be setup and running on localhost:

  * `vulcanize/go-ethereum` [v1.10.18-statediff-4.0.2-alpha](https://github.com/vulcanize/go-ethereum/releases/tag/v1.10.18-statediff-4.0.2-alpha) on port 8545

  * `vulcanize/ipld-eth-server` [v4.0.3-alpha](https://github.com/vulcanize/ipld-eth-server/releases/tag/v4.0.3-alpha) with native GQL API enabled, on port 8082

* In the [config file](./environments/local.toml):

  * Update the database connection settings.

  * Update the `upstream` config and provide the `ipld-eth-server` GQL API endpoint.

  * Update the `server` config with state checkpoint settings.

## Watcher CLI commands (yarn)

spot to explain core commands and flags so they aren't repeated in every tutorial
