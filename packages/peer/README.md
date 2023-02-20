# peer

Package used for connecting between peers and send messages

## Implementations

- [x] Discover peers
- [x] Connect between peers and send messages
- [x] Use package in browser
- [x] Use package in server
- [x] Send messages between systems in different LANs using relay node

## Note

- Avoid any nodejs specific exports from this package as it is intented to be used in browser applications as well

## Known Issues

- `peer:disconnect` event is not fired when remote peer browser is closed
