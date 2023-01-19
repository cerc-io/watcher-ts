//
// Copyright 2022 Vulcanize, Inc.
//

import { Libp2p, createLibp2p } from 'libp2p';
import wrtc from 'wrtc';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import fs from 'fs';
import path from 'path';
import debug from 'debug';

import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { webRTCStar, WebRTCStarTuple } from '@libp2p/webrtc-star';
import { floodsub } from '@libp2p/floodsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import { createFromJSON } from '@libp2p/peer-id-factory';
import type { Connection } from '@libp2p/interface-connection';

import { DEFAULT_SIGNAL_SERVER_URL } from './index.js';
import { HOP_TIMEOUT, PUBSUB_DISCOVERY_INTERVAL, PUBSUB_SIGNATURE_POLICY } from './constants.js';
import { multiaddr } from '@multiformats/multiaddr';

const log = debug('laconic:relay');

interface Arguments {
  signalServer: string;
  peerIdFile: string;
  relayPeers: string;
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
    pubsub: floodsub({ globalSignaturePolicy: PUBSUB_SIGNATURE_POLICY }),
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
    },
    connectionManager: {
      autoDial: false
    }
  });

  console.log(`Relay node started with id ${node.peerId.toString()}`);
  console.log('Listening on:');
  node.getMultiaddrs().forEach((ma) => console.log(ma.toString()));
  console.log();

  // Listen for peers connection
  node.connectionManager.addEventListener('peer:connect', (evt) => {
    // console.log('event peer:connect', evt);
    // Log connected peer
    const connection: Connection = evt.detail;
    log(`Connected to ${connection.remotePeer.toString()} using multiaddr ${connection.remoteAddr.toString()}`);
  });

  // Listen for peers disconnecting
  node.connectionManager.addEventListener('peer:disconnect', (evt) => {
    // console.log('event peer:disconnect', evt);
    // Log disconnected peer
    const connection: Connection = evt.detail;
    log(`Disconnected from ${connection.remotePeer.toString()} using multiaddr ${connection.remoteAddr.toString()}`);
  });

  if (argv.relayPeers) {
    const relayPeersFilePath = path.resolve(argv.relayPeers);

    if (!fs.existsSync(relayPeersFilePath)) {
      console.log(`File at given path ${relayPeersFilePath} not found, exiting`);
      process.exit();
    }

    console.log(`Reading relay peer multiaddr(s) from file ${relayPeersFilePath}`);
    const relayPeersListObj = fs.readFileSync(relayPeersFilePath, 'utf-8');
    const relayPeersList: string[] = JSON.parse(relayPeersListObj);

    await _dialRelayPeers(node, relayPeersList);
  }
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
    },
    relayPeers: {
      type: 'string',
      describe: 'Relay peer multiaddr(s) list file path (json)'
    }
  }).argv;
}

async function _dialRelayPeers (node: Libp2p, relayPeersList: string[]): Promise<void> {
  relayPeersList.forEach(async (relayPeer) => {
    const relayMultiaddr = multiaddr(relayPeer);

    console.log(`Dialling relay node ${relayMultiaddr.getPeerId()} using multiaddr ${relayMultiaddr.toString()}`);
    await node.dial(relayMultiaddr);
  });
}

main().catch(err => {
  console.log(err);
});
