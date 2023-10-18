# watcher-ts

![Cute Panopticon](./docs/watchers-graphic.png)

Watchers make managing data in Dapp development as frictionless as possible. They do this by querying, transforming, and caching Ethereum state data cheaper and faster compared to existing solutions. This data also comes with evidence for generating cryptographic proofs to provide verification that the data is authentic.

Go [here](https://github.com/cerc-io/stack-orchestrator/tree/main/app/data/stacks/erc20) for a quick start demo of setting up the stack and deploying/using the erc20 watcher via the Laconic Stack Orchestrator.


## Prerequisites

### User Mode

- `laconic-so` [Install](https://github.com/cerc-io/stack-orchestrator#setup)

The Laconic Stack Orchestrator provides all the tools to quickly get started using existing watchers.

### Developer Mode

- `yarn` [Install](https://yarnpkg.com/getting-started/install)
- `postgres` [Install](https://www.postgresql.org/download/)

You'll need the above if you plan on digging into this repo, writing your own watchers, or experimenting with watchers not currently supported by Stack Orchestrator.

**Note:** On ARM architecture, use python version ≤ 3.10, otherwise you'll run into [this error](https://github.com/cerc-io/stack-orchestrator/issues/561)

## Services

The default configuration files used by watchers assume the following services are setup and running on localhost:

* [cerc-io/go-ethereum](https://github.com/cerc-io/go-ethereum/tree/v1.10.25-statediff-v4) on port 8545
* [cerc-io/ipld-eth-server](https://github.com/cerc-io/ipld-eth-server) with native GQL API enabled, on port 8082
* [cerc-io/ipld-eth-db](https://github.com/cerc-io/ipld-eth-db) to populate the postgres database for `ipld-eth-server`

These services are dockerized by the Laconic Stack Orchestrator (`laconic-so`). [Use it](https://github.com/cerc-io/stack-orchestrator) unless you plan on digging into those codebases. For more information on setting up these services up by hand, see [here](/docs/README.md)

## Setup

From the root of this repository, run:

`yarn && yarn build`

to download dependencies.

Orient yourself with the available CLI commands [here](docs/cli.md) and in some cases, watchers have in-depth demos (e.g. [mobymask](https://github.com/cerc-io/mobymask-watcher-ts))


[//]: # (TODO: ## Generating Watchers)

## Tests

* [graph-node](./packages/graph-node/README.md)

## Further Reading

[//]: # (TODO: link to docs.laconic.com when ready)

- [Watchers Blog Post](https://www.laconic.com/blog/laconic-watchers)
