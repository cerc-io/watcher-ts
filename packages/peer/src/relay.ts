//
// Copyright 2022 Vulcanize, Inc.
//

import { createLibp2p } from 'libp2p';
import wrtc from 'wrtc';

import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { webRTCDirect } from '@libp2p/webrtc-direct';
import { floodsub } from '@libp2p/floodsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';

import { PUBSUB_DISCOVERY_INTERVAL, RELAY_NODE_LISTEN_ADDRESS } from './constants.js';

async function main (): Promise<void> {
  const node = await createLibp2p({
    addresses: {
      listen: [RELAY_NODE_LISTEN_ADDRESS]
    },
    transports: [webRTCDirect({ wrtc })],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    pubsub: floodsub(),
    peerDiscovery: [
      pubsubPeerDiscovery({
        interval: PUBSUB_DISCOVERY_INTERVAL
      })
    ],
    relay: {
      enabled: true,
      hop: {
        enabled: true
      },
      advertise: {
        enabled: true
      }
    }
  });

  console.log(`Relay node started with id ${node.peerId.toString()}`);
  console.log('Listening on:');
  node.getMultiaddrs().forEach((ma) => console.log(ma.toString()));
}

main().catch(err => {
  console.log(err);
});
