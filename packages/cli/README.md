# cli

## chat

A basic CLI to pass messages between peers using stdin/stdout

* Install dependencies:

  ```bash
  yarn install
  ```

* Build the peer package:

  ```
  cd packages/peer
  yarn build
  ```

* Run a local signalling server (skip if an already running signalling server is available):

  ```bash
  # In packages/peer
  yarn signal-server
  ```

* Start the node:

  ```bash
  # In packages/cli
  yarn chat --signalServer [SIGNAL_SERVER_URL]
  ```

  * `signalServer`: multiaddr of a signalling server (default: local signalling server multiaddr)

* The process starts reading from `stdin` and outputs messages from others peers to `stdout`.
