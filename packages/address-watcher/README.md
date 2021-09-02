# Address Watcher

## Setup

Create a postgres12 database for the job queue:

```
sudo su - postgres
createdb address-watcher-job-queue
```

Enable the `pgcrypto` extension on the job queue database (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro).

Example:

```
postgres@tesla:~$ psql -U postgres -h localhost address-watcher-job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

address-watcher-job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
address-watcher-job-queue=# exit
```

Create a postgres12 database for the address watcher:

```
sudo su - postgres
createdb address-watcher
```

Update `environments/local.toml` with database connection settings for both the databases.

Update the `upstream` config in `environments/local.toml` and provide the `ipld-eth-server` GQL API, the `indexer-db` postgraphile and the tracing API (`debug_traceTransaction` RPC provider) endpoints.

## Run

Run the following scripts in different terminals.

Build files:

```
yarn build
```

GQL server:

```
yarn server

# For development.
yarn server:dev

# For specifying config file.
yarn server -f environments/local.toml
```

Job runner for processing the tracing requests queue:

```
yarn job-runner

# For development.
yarn job-runner:dev

# For specifying config file.
yarn job-runner -f environments/local.toml
```

To fill a block range:

```
yarn fill --start-block 1 --end-block 1000

# For specifying config file.
yarn fill -f environments/local.toml --start-block 1 --end-block 1000
```
