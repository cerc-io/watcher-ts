# watcher-ts

## Setup

There are packages used from github so we need to follow the following steps to install them:

1. Create a github PAT (personal access token) if it does not already exist.

   https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-token

2. Configure the PAT with scopes mentioned in https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages#about-scopes-and-permissions-for-package-registries. This is required to install or publish github packages.

3. Follow the steps in https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-with-a-personal-access-token to authenticate to github packages. We can also run the follwing to authenticate by logging in to npm.

   ```bash
   $ npm login --scope=@cerc-io --registry=https://npm.pkg.github.com

   > Username: USERNAME
   > Password: TOKEN
   > Email: PUBLIC-EMAIL-ADDRESS
   ```

   Replace with the following:
   - `USERNAME`: GitHub username
   - `TOKEN`: Personal access token (configured above)
   - `PUBLIC-EMAIL-ADDRESS`: Email address

4. When authenticating to github packages for the first time, yarn install may throw Unauthorized error. To overcome this we need to run yarn install in `packages/graph-node` directory. After this yarn install for watcher-ts works properly even from root of the repo.

This project uses [yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces/).

Install packages (Node.JS v16.13.1):

```bash
yarn
```

Build packages:

```bash
yarn build
```

## Tests

* [graph-node](./packages/graph-node/README.md)

## Services

The default config files used by the watchers assume the following services are setup and running on localhost:

* `vulcanize/go-ethereum` on port 8545
* `vulcanize/ipld-eth-server` with native GQL API enabled, on port 8082

### Note

* In `vulcanize/ipld-eth-server`, add the following statement to `[ethereum]` section in `environments/config.toml`:

  `chainConfig = "./chain.json" # ETH_CHAIN_CONFIG`

## Watchers

* [eden-watcher](./packages/eden-watcher/README.md)
* [erc20-watcher](./packages/erc20-watcher/README.md)
* [erc721-watcher](./packages/erc721-watcher/README.md)
* [graph-test-watcher](./packages/graph-test-watcher/README.md)
* [mobymask-watcher](./packages/mobymask-watcher/README.md)
