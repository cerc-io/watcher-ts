# Watcher Documentation

This document is specifically focused on standing up a minimal core version of the Laconic Stack *without* using [Stack Orchestrator]( https://github.com/cerc-io/stack-orchestrator). If this is your first foray into the stack, start with Stack Orchestrator. To understand what is going on under the hood or to make contributions to this repo, this is a good place to start.

There are 3 main components to setting up an environment for running watchers:
- core services
- configure postgres
- edit config file

After which you should be able to navigate to the `README.md` of any watcher and run through its demo using `yarn`. The common `yarn` CLI commands for watchers are documented [here](../cli.md).

## Core services

The following core services should be setup and running on localhost:

* `cerc-io/go-ethereum` [v1.10.26-statediff-4.2.2-alpha](https://github.com/cerc-io/go-ethereum/releases/tag/v1.10.26-statediff-4.2.2-alpha)
 on port 8545

* `cerc-io/ipld-eth-server` [v4.2.2-alpha](https://github.com/cerc-io/ipld-eth-server/releases/tag/v4.2.2-alpha) with native GQL API enabled, on port 8082

* `cerc-io/ipld-eth-db` [v4.2.2-alpha](https://github.com/cerc-io/ipld-eth-db/releases/tag/v4.2.2-alpha) is the postgres schema required for `ipld-eth-server`

## Setup Postgres

In this example, we use the `erc20-watcher`; for another watcher substitute with its name.

Create a postgres database for the watcher:

```bash
sudo su - postgres
createdb erc20-watcher
```

Create a postgres database for the job queue:

```
sudo su - postgres
createdb erc20-watcher-job-queue
```

Enable the `pgcrypto` [extension](https://github.com/timgit/pg-boss/tree/master/docs#database-install) on the job queue database.

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

## Config File

In each watchers' directory is a config file: `<watcher>/environments/local.toml`:

* Update the database connection settings.
* Update the `upstream` config and provide the `ipld-eth-server` GraphQL API endpoint.
* Select "active" vs. "lazy" watcher depending on its kind.

For example:
```toml
[server]
  kind = "active"

[database]
  type = "postgres"
  host = "localhost"
  port = 5432
  database = "erc20-watcher"
  username = "postgres"
  password = "postgres"

[jobQueue]
  dbConnectionString = "postgres://postgres:postgres@localhost/erc20-watcher-job-queue"

[upstream]
  [upstream.ethServer]
    gqlApiEndpoint = "http://127.0.0.1:8082/graphql"
    rpcProviderEndpoint = "http://127.0.0.1:8081"
```

Now that your environment is setup, you can test run any watcher!
