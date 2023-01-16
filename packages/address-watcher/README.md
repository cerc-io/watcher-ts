# Address Watcher

## Setup

First try the [stack orchestrator](https://github.com/cerc-io/stack-orchestrator) to quickly get started. Advanced users can see [here](/docs/README.md) for instructions on setting up a local environment by hand. 

Build files:

```bash
yarn && yarn build
```

## Run

Run the following commands in different terminals:

GraphQL server:

```bash
yarn server
```

Job runner for processing the tracing requests queue:

```bash
yarn job-runner
```

To fill a block range:

```bash
yarn fill --start-block 1 --end-block 1000
```
