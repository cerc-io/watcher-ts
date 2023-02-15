//
// Copyright 2022 Vulcanize, Inc.
//

import { Libp2p, createLibp2p } from '@cerc-io/libp2p';
import wrtc from 'wrtc';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import fs from 'fs';
import path from 'path';
import debug from 'debug';

import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { WebRTCDirectNodeType, webRTCDirect } from '@cerc-io/webrtc-direct';
import { floodsub } from '@libp2p/floodsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import { createFromJSON } from '@libp2p/peer-id-factory';
import type { Connection } from '@libp2p/interface-connection';
import { multiaddr } from '@multiformats/multiaddr';
import type { PeerId } from '@libp2p/interface-peer-id';

import { HOP_TIMEOUT, PUBSUB_DISCOVERY_INTERVAL, PUBSUB_SIGNATURE_POLICY } from './constants.js';
import { PeerHearbeatChecker } from './peer-heartbeat-checker.js';

const log = debug('laconic:relay');

interface Arguments {
  host: string;
  port: number;
  announce: string;
  peerIdFile: string;
  relayPeers: string;
}

async function main (): Promise<void> {
  const argv: Arguments = _getArgv();

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

  const listenMultiaddrs = [`/ip4/${argv.host}/tcp/${argv.port}/http/p2p-webrtc-direct`];
  const announceMultiaddrs = [];

  if (argv.announce) {
    announceMultiaddrs.push(`/dns4/${argv.announce}/tcp/443/https/p2p-webrtc-direct`);
  }

  const node = await createLibp2p({
    peerId,
    addresses: {
      listen: listenMultiaddrs,
      announce: announceMultiaddrs
    },
    transports: [
      webRTCDirect({
        wrtc,
        enableSignalling: true,
        nodeType: WebRTCDirectNodeType.Relay
      })
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

  const peerHeartbeatChecker = new PeerHearbeatChecker(node);

  console.log(`Relay node started with id ${node.peerId.toString()}`);
  console.log('Listening on:');
  node.getMultiaddrs().forEach((ma) => console.log(ma.toString()));

  // Listen for peers connection
  node.addEventListener('peer:connect', async (evt) => {
    // console.log('event peer:connect', evt);
    // Log connected peer
    const connection: Connection = evt.detail;
    log(`Connected to ${connection.remotePeer.toString()} using multiaddr ${connection.remoteAddr.toString()}`);

    // Start heartbeat check for peer
    await peerHeartbeatChecker.start(
      connection.remotePeer,
      async () => _handleDeadConnections(node, connection.remotePeer)
    );
  });

  // Listen for peers disconnecting
  node.addEventListener('peer:disconnect', (evt) => {
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
    host: {
      type: 'string',
      alias: 'h',
      default: '127.0.0.1',
      describe: 'Host to bind to'
    },
    port: {
      type: 'number',
      alias: 'p',
      default: '9090',
      describe: 'Port to start listening on'
    },
    announce: {
      type: 'string',
      alias: 'a',
      describe: 'Domain name to be used in the announce address'
    },
    peerIdFile: {
      type: 'string',
      alias: 'f',
      describe: 'Relay Peer Id file path (json)'
    },
    relayPeers: {
      type: 'string',
      alias: 'r',
      describe: 'Relay peer multiaddr(s) list file path (json)'
    }
  }).argv;
}

async function _dialRelayPeers (node: Libp2p, relayPeersList: string[]): Promise<void> {
  relayPeersList.forEach(async (relayPeer) => {
    const relayMultiaddr = multiaddr(relayPeer);
    const peerIdString = relayMultiaddr.getPeerId()?.toString();

    try {
      console.log(`Dialling relay node ${peerIdString} using multiaddr ${relayMultiaddr.toString()}`);
      await node.dial(relayMultiaddr);
    } catch (err: any) {
      console.log(`Could not dial ${peerIdString}`, err);
    }
  });
}

async function _handleDeadConnections (node: Libp2p, remotePeerId: PeerId): Promise<void> {
  // Close existing connections of remote peer
  log(`Closing connections for ${remotePeerId}`);
  await node.hangUp(remotePeerId);
  log('Closed');
}

main().catch(err => {
  console.log(err);
});
