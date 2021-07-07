# Uniswap Watcher

Run the server:

```bash
$ yarn server
```

Start watching the factory contract:

Example:

```bash
$ yarn watch:contract --address 0xfE0034a874c2707c23F91D7409E9036F5e08ac34 --kind factory --startingBlock 100
```

## Scripts

* `yarn server`

  Start the GraphQL server.

* `yarn watch:contract`

  Add contract to watch.

* `yarn lint`

  Lint files.
  
  ```bash
  # Lint fix.
  $ yarn lint --fix
  ```
