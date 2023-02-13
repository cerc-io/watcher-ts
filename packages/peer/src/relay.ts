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

import { HOP_TIMEOUT, PUBSUB_DISCOVERY_INTERVAL, PUBSUB_SIGNATURE_POLICY } from './constants.js';
import { PeerHearbeatChecker } from './peer-heartbeat-checker.js';

const log = debug('laconic:relay');

export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_PORT = 9090;

export async function createRelayNode (listenPort: number, relayPeersList: string[], peerId?: PeerId): Promise<Libp2p> {
  const listenMultiaddr = `/ip4/${DEFAULT_HOST}/tcp/${listenPort}/http/p2p-webrtc-direct`;

  const node = await createLibp2p({
    peerId,
    addresses: {
      listen: [listenMultiaddr]
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

  if (relayPeersList.length) {
    console.log('Dialling relay peers');
    await _dialRelayPeers(node, relayPeersList);
  }

  return node;
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
