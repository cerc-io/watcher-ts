# watcher-ts

![Cute Panopticon](./docs/watchers-graphic.png)

Watchers make managing data in Dapp development as frictionless as possible. They do this by querying, transforming, and caching Ethereum state data cheaper and faster compared to existing solutions. This data also comes with evidence for generating cryptographic proofs to provide verification that the data is authentic. Public watchers are found in the [packages](./packages) directory.

Go [here](https://github.com/cerc-io/stack-orchestrator/tree/main/stacks/erc20) for a quick start demo of setting up the stack and deploying/using the erc20 watcher via the Laconic Stack Orchestrator.


## Prerequisites

### User Mode

- `laconic-so` [Install](https://github.com/cerc-io/stack-orchestrator#setup)

The Laconic Stack Orchestrator provides all the tools to quickly get started with watchers.

### Developer Mode

- `yarn` [Install](https://yarnpkg.com/getting-started/install)
- `postgres` [Install](https://www.postgresql.org/download/)

You'll need the above if you plan on digging into this repo and/or writing your own watchers.

## Services

The default configuration files used by watchers assume the following services are setup and running on localhost:

* [cerc-io/go-ethereum](https://github.com/cerc-io/go-ethereum/tree/v1.10.25-statediff-v4) on port 8545
* [cerc-io/ipld-eth-server](https://github.com/cerc-io/ipld-eth-server) with native GQL API enabled, on port 8082
* [cerc-io/ipld-eth-db](https://github.com/cerc-io/ipld-eth-db) to populate the postgres database for `ipld-eth-server`

These services are dockerized by the Laconic Stack Orchestrator (`laconic-so`). [Use it](https://github.com/cerc-io/stack-orchestrator) unless you plan on digging into those codebases.

## Setup

From the root of this repository, run:

`yarn && yarn build`

to download dependencies and build all the watchers.

Each watcher has a README with instruction on building and using it. See the [packages](./packages) directory for all available watchers.

[//]: # (TODO: ## Generating Watchers)

## Tests

* [graph-node](./packages/graph-node/README.md)

[//]: # (TODO: ## Contibuting: https://github.com/LaconicNetwork/Laconic-Documentation/issues/93)

## Further Reading

[//]: # (TODO: link to docs.laconic.com when ready)

- [Watchers Blog Post](https://www.laconic.com/blog/laconic-watchers)
