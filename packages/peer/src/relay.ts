//
// Copyright 2022 Vulcanize, Inc.
//

import { createLibp2p } from 'libp2p';
import wrtc from 'wrtc';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';

import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { webRTCStar, WebRTCStarTuple } from '@libp2p/webrtc-star';
import { floodsub } from '@libp2p/floodsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';

import { DEFAULT_SIGNAL_SERVER_URL } from './index.js';

interface Arguments {
  signalServer: string;
}

async function main (): Promise<void> {
  const argv: Arguments = _getArgv();
  if (!argv.signalServer) {
    console.log('Using the default signalling server URL');
  }

  const wrtcStar: WebRTCStarTuple = webRTCStar({ wrtc });
  const node = await createLibp2p({
    addresses: {
      listen: [
        argv.signalServer || DEFAULT_SIGNAL_SERVER_URL
      ]
    },
    transports: [
      wrtcStar.transport
    ],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    pubsub: floodsub(),
    peerDiscovery: [
      pubsubPeerDiscovery({
        interval: 1000
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

function _getArgv (): any {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    signalServer: {
      type: 'string',
      describe: 'Signalling server URL'
    },
    relayNode: {
      type: 'string',
      describe: 'Relay node URL'
    }
  }).argv;
}

main().catch(err => {
  console.log(err);
});
