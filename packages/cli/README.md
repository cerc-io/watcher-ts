# cli

## chat

A basic CLI to pass messages between peers using `stdin`/`stdout`

* Install dependencies:

  ```bash
  yarn install
  ```

* Build the `peer` package:

  ```
  cd packages/peer
  yarn build
  ```

* (Optional) Run a local signalling server:

  ```bash
  # In packages/peer
  yarn signal-server
  ```

* (Optional) Run a local relay node:

  ```bash
  # In packages/peer
  yarn relay-node --signal-server [SIGNAL_SERVER_URL]
  ```

  * `signal-server`: multiaddr of a signalling server (default: local signalling server multiaddr)

* Start the node:

  ```bash
  # In packages/cli
  yarn chat --signal-server [SIGNAL_SERVER_URL] --relay-node [RELAY_NODE_URL]
  ```

  * `signal-server`: multiaddr of a signalling server (default: local signalling server multiaddr)
  * `relay-node`: multiaddr of a hop enabled relay node

* The process starts reading from `stdin` and outputs messages from others peers to `stdout`.
