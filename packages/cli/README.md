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

* (Optional) Create and export a peer id for the relay node:

  ```bash
  # In packages/peer
  yarn create-peer --file [PEER_ID_FILE_PATH]
  ```

  * `file (f)`: file path to export the peer id to (json) (default: logs to console)

* (Optional) Run a local relay node:

  ```bash
  # In packages/peer
  yarn relay-node --host [LISTEN_HOST] --port [LISTEN_PORT] --announce [ANNOUNCE_DOMAIN] --peer-id-file [PEER_ID_FILE_PATH] --relay-peers [RELAY_PEERS_FILE_PATH]
  ```

  * `host (h)`: host to bind to (default: `127.0.0.1`)
  * `port (p)`: port to start listening on (default: `9090`)
  * `announce (a)`: domain name to be used in the announce address
  * `peer-id-file (f)`: file path for peer id to be used (json)
  * `relay-peers (r)`: file path for relay peer multiaddr(s) to dial on startup (json)

* Start the node:

  ```bash
  # In packages/cli
  yarn chat --relay-node <RELAY_NODE_URL>
  ```

  * `relay-node`: multiaddr of a primary hop enabled relay node

* The process starts reading from `stdin` and outputs messages from others peers to `stdout`.
