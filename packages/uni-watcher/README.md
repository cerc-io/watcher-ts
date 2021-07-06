# Uniswap Watcher

Run the server:

```bash
$ yarn server
```

Start watching the factory contract:

Example:

```bash
$ npx ts-node src/cli/watch-contract.ts --configFile environments/local.toml --address 0xfE0034a874c2707c23F91D7409E9036F5e08ac34 --kind factory --startingBlock 100
```

