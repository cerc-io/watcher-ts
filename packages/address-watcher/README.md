# Address Watcher

## Setup

Create a postgres12 database for the job queue:

```
sudo su - postgres
createdb job-queue
```

Enable the `pgcrypto` extension on the job queue database (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro).

Example:

```
postgres@tesla:~$ psql -U postgres -h localhost job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
job-queue=# exit
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


GQL server:

```
yarn server
```

Job runner for processing the tracing requests queue:

```
yarn job-runner
```

To fill a block range:

```
yarn fill --startBlock 1 --endBlock 1000
```
