//
// Copyright 2022 Vulcanize, Inc.
//

import { Libp2p, createLibp2p } from '@cerc-io/libp2p';
import wrtc from 'wrtc';
import debug from 'debug';

import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { WebRTCDirectNodeType, webRTCDirect } from '@cerc-io/webrtc-direct';
import { floodsub } from '@libp2p/floodsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import type { Connection } from '@libp2p/interface-connection';
import { multiaddr } from '@multiformats/multiaddr';
import type { PeerId } from '@libp2p/interface-peer-id';
import { createFromJSON } from '@libp2p/peer-id-factory';

import { HOP_TIMEOUT, PUBSUB_DISCOVERY_INTERVAL, PUBSUB_SIGNATURE_POLICY, WEBRTC_PORT_RANGE, RELAY_REDIAL_DELAY } from './constants.js';
import { PeerHearbeatChecker } from './peer-heartbeat-checker.js';
import { dialWithRetry } from './utils/index.js';
import { PeerIdObj } from './peer.js';

const log = debug('laconic:relay');

export interface RelayNodeInit {
  host: string;
  port: number;
  announceDomain?: string;
  relayPeers: string[];
  maxDialRetry: number;
  peerIdObj?: PeerIdObj;
}

export async function createRelayNode (init: RelayNodeInit): Promise<Libp2p> {
  const listenMultiaddrs = [`/ip4/${init.host}/tcp/${init.port}/http/p2p-webrtc-direct`];
  const announceMultiaddrs = [];

  if (init.announceDomain) {
    announceMultiaddrs.push(`/dns4/${init.announceDomain}/tcp/443/https/p2p-webrtc-direct`);
  }

  let peerId: PeerId | undefined;
  if (init.peerIdObj) {
    peerId = await createFromJSON(init.peerIdObj);
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
    if (init.relayPeers.includes(remoteAddr.toString())) {
      await dialWithRetry(
        node,
        remoteAddr,
        {
          redialDelay: RELAY_REDIAL_DELAY,
          maxRetry: init.maxDialRetry
        }
      ).catch((error: Error) => console.log(error.message));
    }
  });

  if (init.relayPeers.length) {
    console.log('Dialling relay peers');
    await _dialRelayPeers(node, init.relayPeers, init.maxDialRetry);
  }

  return node;
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
