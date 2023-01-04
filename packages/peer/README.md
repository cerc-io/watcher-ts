# peer

Package used for connecting between peers and send messages

## Implementations

- [x] Discover peers
- [x] Connect between peers and send messages
- [x] Use package in browser
- [x] Use package in server
- [x] Send messages between systems in different LANs

## Issues

- Error is thrown when connecting peers in different LANs

  ```text
  AggregateError: All promises were rejected
  ```

  According to stack trace error is thrown in [@libp2p/mplex](https://github.com/libp2p/js-libp2p-mplex) package

- `peer:disconnect` event is not fired when remote peer browser is closed
