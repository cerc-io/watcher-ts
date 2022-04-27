# watcher-ts

## Setup

There are packages used from github so we need to follow the following steps to install them:

1. Create a github PAT (personal access token) if it does not already exist.

   https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-token

2. Configure the PAT with scopes mentioned in https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages#about-scopes-and-permissions-for-package-registries. This is required to install or publish github packages.

3. Follow the steps in https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-with-a-personal-access-token to authenticate to github packages. We can also run the follwing to authenticate by logging in to npm.

   ```bash
   $ npm login --scope=@vulcanize --registry=https://npm.pkg.github.com

   > Username: USERNAME
   > Password: TOKEN
   > Email: PUBLIC-EMAIL-ADDRESS
   ```

   Replace with the following:
   - `USERNAME`: GitHub username
   - `TOKEN`: Personal access token (configured above)
   - `PUBLIC-EMAIL-ADDRESS`: Email address

4. When authenticating to github packages for the first time, yarn install may throw Unauthorized error. To overcome this we need to run yarn install in `packages/graph-node` directory of graph-watcher repo. After this yarn install for graph-watcher-ts works properly even from root of the repo.

This project uses [yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces/).

Install packages (Node.JS v16.13.1):

```bash
yarn
```

### Services

The default config files used by the watchers assume the following services are setup and running on localhost:

* `vulcanize/go-ethereum` on port 8545
* `vulcanize/ipld-eth-server` with native GQL API enabled, on port 8082
* `postgraphile` on the `vulcanize/ipld-eth-server` database, on port 5000

#### Note

* In `vulcanize/ipld-eth-server`, add the following statement to `[ethereum]` section in `environments/config.toml`:

  `chainConfig = "./chain.json" # ETH_CHAIN_CONFIG`

### Databases

Note: Requires `postgres12`.

Login as the postgres user:

```bash
sudo su - postgres
```

Create the databases for the watchers:

```
createdb erc20-watcher
createdb address-watcher
createdb uni-watcher
createdb uni-info-watcher
```

Create the databases for the job queues and enable the `pgcrypto` extension on them (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

```
createdb erc20-watcher-job-queue
createdb address-watcher-job-queue
createdb uni-watcher-job-queue
createdb uni-info-watcher-job-queue
```

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

```
postgres@tesla:~$ psql -U postgres -h localhost uni-info-watcher-job-queue
Password for user postgres:
psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

uni-info-watcher-job-queue=# CREATE EXTENSION pgcrypto;
CREATE EXTENSION
uni-info-watcher-job-queue=# exit
```

#### Reset

Reset the databases used by the watchers:

```bash
yarn db:reset
```

## Run

Build the files in packages:

```bash
yarn build

# To watch for changes and build (used in development).
yarn build:watch
```

To run any watcher, `cd` into their package folder and run:

```bash
yarn server
```

If the watcher uses a job queue, start the job runner in another terminal:

```bash
yarn job-runner
```
