import { createLibp2p } from 'libp2p';
import wrtc from 'wrtc';

import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { webRTCStar, WebRTCStarTuple } from '@libp2p/webrtc-star';

import { DEFAULT_SIGNAL_SERVER_URL } from './index.js';

async function main (): Promise<void> {
  const wrtcStar: WebRTCStarTuple = webRTCStar({ wrtc });
  const node = await createLibp2p({
    addresses: {
      listen: [
        DEFAULT_SIGNAL_SERVER_URL
      ]
    },
    transports: [
      wrtcStar.transport
    ],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
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
