//
// Copyright 2022 Vulcanize, Inc.
//

import { createLibp2p } from 'libp2p';
import wrtc from 'wrtc';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import fs from 'fs';
import path from 'path';

import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { webRTCStar, WebRTCStarTuple } from '@libp2p/webrtc-star';
import { floodsub } from '@libp2p/floodsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import { createFromJSON } from '@libp2p/peer-id-factory';

import { DEFAULT_SIGNAL_SERVER_URL } from './index.js';
import { HOP_TIMEOUT, PUBSUB_DISCOVERY_INTERVAL } from './constants.js';

interface Arguments {
  signalServer: string;
  peerIdFile: string;
}

async function main (): Promise<void> {
  const argv: Arguments = _getArgv();
  if (!argv.signalServer) {
    console.log('Using the default signalling server URL');
  }

  let peerId: any;
  if (argv.peerIdFile) {
    const peerIdFilePath = path.resolve(argv.peerIdFile);
    console.log(`Reading peer id from file ${peerIdFilePath}`);

    const peerIdObj = fs.readFileSync(peerIdFilePath, 'utf-8');
    const peerIdJson = JSON.parse(peerIdObj);
    peerId = await createFromJSON(peerIdJson);
  } else {
    console.log('Creating a new peer id');
  }

  const wrtcStar: WebRTCStarTuple = webRTCStar({ wrtc });
  const node = await createLibp2p({
    peerId,
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
        interval: PUBSUB_DISCOVERY_INTERVAL
      })
    ],
    relay: {
      enabled: true,
      hop: {
        enabled: true,
        timeout: HOP_TIMEOUT
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
    peerIdFile: {
      type: 'string',
      describe: 'Relay Peer Id file path (json)'
    }
  }).argv;
}

main().catch(err => {
  console.log(err);
});
