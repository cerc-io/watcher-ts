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

import { HOP_TIMEOUT, PUBSUB_DISCOVERY_INTERVAL, PUBSUB_SIGNATURE_POLICY, WEBRTC_PORT_RANGE, RELAY_REDIAL_DELAY } from './constants.js';
import { PeerHearbeatChecker } from './peer-heartbeat-checker.js';
import { dialWithRetry } from './utils/index.js';

const log = debug('laconic:relay');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9090;
const DEFAULT_MAX_DIAL_RETRY = 5;

interface Arguments {
  host: string;
  port: number;
  announce?: string;
  peerIdFile?: string;
  relayPeers?: string;
  maxDialRetry: number;
}

async function main (): Promise<void> {
  const argv: Arguments = _getArgv();
  let peerId: PeerId | undefined;
  let relayPeersList: string[] = [];

  if (argv.peerIdFile) {
    const peerIdFilePath = path.resolve(argv.peerIdFile);
    console.log(`Reading peer id from file ${peerIdFilePath}`);

    const peerIdObj = fs.readFileSync(peerIdFilePath, 'utf-8');
    const peerIdJson = JSON.parse(peerIdObj);
    peerId = await createFromJSON(peerIdJson);
  } else {
    console.log('Creating a new peer id');
  }

  if (argv.relayPeers) {
    const relayPeersFilePath = path.resolve(argv.relayPeers);

    if (!fs.existsSync(relayPeersFilePath)) {
      console.log(`File at given path ${relayPeersFilePath} not found, exiting`);
      process.exit();
    }

    console.log(`Reading relay peer multiaddr(s) from file ${relayPeersFilePath}`);
    const relayPeersListObj = fs.readFileSync(relayPeersFilePath, 'utf-8');
    relayPeersList = JSON.parse(relayPeersListObj);
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
        nodeType: WebRTCDirectNodeType.Relay,
        initiatorOptions: { webRTCPortRange: WEBRTC_PORT_RANGE },
        receiverOptions: { webRTCPortRange: WEBRTC_PORT_RANGE }
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
  // peer:disconnect event is trigerred when all connections to a peer close
  // https://github.com/libp2p/js-libp2p-interfaces/blob/master/packages/interface-libp2p/src/index.ts#L64
  node.addEventListener('peer:disconnect', async (evt) => {
    log('event peer:disconnect', evt);

    // Log disconnected peer
    const connection: Connection = evt.detail;
    const remoteAddr = connection.remoteAddr;
    log(`Disconnected from ${connection.remotePeer.toString()} using multiaddr ${remoteAddr.toString()}`);

    // Stop connection check for disconnected peer
    peerHeartbeatChecker.stop(connection.remotePeer);

    // Redial if disconnected peer is in relayPeers list
    if (relayPeersList.includes(remoteAddr.toString())) {
      await dialWithRetry(
        node,
        remoteAddr,
        {
          redialDelay: RELAY_REDIAL_DELAY,
          maxRetry: argv.maxDialRetry
        }
      ).catch((error: Error) => console.log(error.message));
    }
  });

  if (relayPeersList.length) {
    console.log('Dialling relay peers');
    await _dialRelayPeers(node, relayPeersList, argv.maxDialRetry);
  }
}

function _getArgv (): Arguments {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    host: {
      type: 'string',
      alias: 'h',
      default: DEFAULT_HOST,
      describe: 'Host to bind to'
    },
    port: {
      type: 'number',
      alias: 'p',
      default: DEFAULT_PORT,
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
    },
    maxDialRetry: {
      type: 'number',
      describe: 'Maximum number of retries for dialling a relay peer',
      default: DEFAULT_MAX_DIAL_RETRY
    }
  // https://github.com/yargs/yargs/blob/main/docs/typescript.md?plain=1#L83
  }).parseSync();
}

async function _dialRelayPeers (node: Libp2p, relayPeersList: string[], maxDialRetry: number): Promise<void> {
  relayPeersList.forEach(async (relayPeer) => {
    const relayMultiaddr = multiaddr(relayPeer);
    await dialWithRetry(
      node,
      relayMultiaddr,
      {
        redialDelay: RELAY_REDIAL_DELAY,
        maxRetry: maxDialRetry
      }
    ).catch((error: Error) => console.log(error.message));
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
