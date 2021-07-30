# Uniswap Watcher

## Setup

Create a postgres12 database for the job queue:

```
sudo su - postgres
createdb uni-watcher-job-queue
```

Enable the `pgcrypto` extension on the job queue database (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro).

Example:

```
postgres@tesla:~$ psql -U postgres -h localhost uni-watcher-job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

uni-watcher-job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
uni-watcher-job-queue=# exit
```

Create a postgres12 database for the address watcher:

```
sudo su - postgres
createdb uni-watcher
```

Update `environments/local.toml` with database connection settings for both the databases.


## Run

Run the server:

```bash
$ yarn server
```

Start the job runner:

```bash
$ yarn job-runner
```

Start watching the factory contract:

Example:

```bash
$ yarn watch:contract --address 0xfE0034a874c2707c23F91D7409E9036F5e08ac34 --kind factory --startingBlock 100
```

Start watching the NonFungiblePositionManager contract:

Example:

```bash
$ yarn watch:contract --address 0xB171168C0df9457Ff3E3D795aE25Bf4f41e2FFE3 --kind nfpm --startingBlock 100
```

To fill a block range:

```bash
$ yarn fill --startBlock <from-block> --endBlock <to-block>
```

Example:

```bash
$ yarn fill --startBlock 1000 --endBlock 2000
```

## Test

To test the watchers locally:

* Deploy the Uniswap contracts
* Watch the Factory and NonFungiblePositionManager contracts
* Send transactions to trigger events

See https://github.com/vulcanize/uniswap-v3-periphery/blob/watcher-ts/demo.md for instructions.

### Smoke test

To run a smoke test:

* Start the server and the job-runner.
* Run:

  ```bash
  $ yarn smoke-test
  ```
