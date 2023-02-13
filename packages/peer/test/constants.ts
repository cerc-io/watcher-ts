import { multiaddr } from '@multiformats/multiaddr';
// import { createFromJSON } from '@libp2p/peer-id-factory';

// import relayPeerIdJson from './relay-peer-id.json' assert { type: 'json' };

export const RELAY_PORT = 12345;
// export const RELAY_PEER_ID = await createFromJSON(relayPeerIdJson);
export const RELAY_LISTEN_ADDR = multiaddr(`/ip4/0.0.0.0/tcp/${RELAY_PORT}/http/p2p-webrtc-direct`);
// export const RELAY_MULTIADDR = multiaddr(`${RELAY_LISTEN_ADDR.toString()}/p2p/${RELAY_PEER_ID.toString()}`);
