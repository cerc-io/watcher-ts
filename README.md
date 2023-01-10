# watcher-ts

## Setup

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

## Development

* To update versions in all packages run the following:

  ```bash
  yarn version:set <VERSION>
  yarn version:set-codegen <VERSION>
  ```

  Example

  ```bash
  yarn version:set 0.2.20
  yarn version:set-codegen 0.2.20
  ```
