# Address Watcher

## Setup

First try the [stack orchestrator](https://github.com/cerc-io/stack-orchestrator) to quickly get started. Advanced users can see [here](/docs/README.md) for instructions on setting up a local environment by hand. 

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
