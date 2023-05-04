//
// Copyright 2022 Vulcanize, Inc.
//

import { Libp2p, createLibp2p } from '@cerc-io/libp2p';
import debug from 'debug';
import assert from 'assert';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';

import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { webSockets } from '@libp2p/websockets';
import { floodsub } from '@libp2p/floodsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import type { Message } from '@libp2p/interface-pubsub';
import type { Connection } from '@libp2p/interface-connection';
import { multiaddr } from '@multiformats/multiaddr';
import type { PeerId } from '@libp2p/interface-peer-id';
import { createFromJSON } from '@libp2p/peer-id-factory';
import { PrometheusMetrics } from '@cerc-io/prometheus-metrics';

import {
  HOP_TIMEOUT,
  DEFAULT_PING_TIMEOUT,
  PUBSUB_DISCOVERY_INTERVAL,
  PUBSUB_SIGNATURE_POLICY,
  MAX_CONCURRENT_DIALS_PER_PEER,
  DEBUG_INFO_TOPIC
} from './constants.js';
import { PeerHearbeatChecker } from './peer-heartbeat-checker.js';
import { debugInfoRequestHandler, dialWithRetry, getConnectionsInfo, getPseudonymForPeerId, getSelfInfo, isMultiaddrBlacklisted } from './utils/index.js';
import { PeerIdObj } from './peer.js';
import { SelfInfo, ConnectionInfo } from './types/debug-info.js';

const log = debug('laconic:relay');

export interface RelayNodeInitConfig {
  host: string;
  port: number;
  peerIdObj?: PeerIdObj;
  announceDomain?: string;
  relayPeers: string[];
  denyMultiaddrs: string[];
  dialTimeout: number;
  pingInterval: number;
  pingTimeout?: number;
  redialInterval: number;
  maxDialRetry: number;
  enableDebugInfo?: boolean;
}

export async function createRelayNode (init: RelayNodeInitConfig): Promise<Libp2p> {
  const listenMultiaddrs = [`/ip4/${init.host}/tcp/${init.port}/ws`];
  const announceMultiaddrs = [];

  if (init.announceDomain) {
    announceMultiaddrs.push(`/dns4/${init.announceDomain}/tcp/443/wss`);
  }

  let peerId: PeerId | undefined;
  if (init.peerIdObj) {
    peerId = await createFromJSON(init.peerIdObj);
  }

  const pingTimeout = init.pingTimeout ?? DEFAULT_PING_TIMEOUT;

  const metrics = new PrometheusMetrics();

  const node = await createLibp2p({
    peerId,
    addresses: {
      listen: listenMultiaddrs,
      announce: announceMultiaddrs
    },
    transports: [webSockets()],
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
      }
    },
    webRTCSignal: {
      enabled: true,
      isSignallingNode: true
    },
    connectionManager: {
      maxDialsPerPeer: MAX_CONCURRENT_DIALS_PER_PEER,
      autoDial: false,
      dialTimeout: init.dialTimeout,
      deny: init.denyMultiaddrs
    },
    ping: {
      timeout: pingTimeout
    },
    metrics: () => metrics
  });

  const peerHeartbeatChecker = new PeerHearbeatChecker(
    node,
    {
      pingInterval: init.pingInterval,
      pingTimeout
    }
  );

  log(`Relay node started with id ${node.peerId.toString()} (${getPseudonymForPeerId(node.peerId.toString())})`);
  log('Listening on:');
  node.getMultiaddrs().forEach((ma) => log(ma.toString()));

  // Listen for peers connection
  node.addEventListener('peer:connect', async (evt) => {
    // log('event peer:connect', evt);
    // Log connected peer
    const connection: Connection = evt.detail;
    log(`Connected to ${connection.remotePeer.toString()} (${getPseudonymForPeerId(connection.remotePeer.toString())}) using multiaddr ${connection.remoteAddr.toString()}`);

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
    // log('event peer:disconnect', evt);

    // Log disconnected peer
    const connection: Connection = evt.detail;
    const remoteAddr = connection.remoteAddr;
    log(`Disconnected from ${connection.remotePeer.toString()} (${getPseudonymForPeerId(connection.remotePeer.toString())}) using multiaddr ${remoteAddr.toString()}`);

    // Stop connection check for disconnected peer
    peerHeartbeatChecker.stop(connection.remotePeer);

    // Redial if disconnected peer is in relayPeers list
    if (init.relayPeers.includes(remoteAddr.toString())) {
      await dialWithRetry(
        node,
        remoteAddr,
        {
          redialInterval: init.redialInterval,
          maxRetry: init.maxDialRetry
        }
      ).catch((error: Error) => log(error.message));
    }
  });

  if (init.relayPeers.length) {
    log('Dialling relay peers');
    await _dialRelayPeers(node, init.relayPeers, init.denyMultiaddrs, init.maxDialRetry, init.redialInterval);
  }

  if (init.enableDebugInfo) {
    log('Debug info enabled');
    await _subscribeToDebugTopic(node, peerHeartbeatChecker, metrics);
  }

  return node;
}

async function _dialRelayPeers (node: Libp2p, relayPeersList: string[], denyMultiaddrs: string[], maxDialRetry: number, redialInterval: number): Promise<void> {
  relayPeersList.forEach(async (relayPeer) => {
    const relayMultiaddr = multiaddr(relayPeer);
    if (isMultiaddrBlacklisted(denyMultiaddrs, relayMultiaddr)) {
      log(`Ignoring blacklisted node with multiaddr ${relayMultiaddr.toString()}`);
      return;
    }

    await dialWithRetry(
      node,
      relayMultiaddr,
      {
        redialInterval,
        maxRetry: maxDialRetry
      }
    ).catch((error: Error) => log(error.message));
  });
}

async function _handleDeadConnections (node: Libp2p, remotePeerId: PeerId): Promise<void> {
  // Close existing connections of remote peer
  log(`Closing connections for ${remotePeerId} (${getPseudonymForPeerId(remotePeerId.toString())})`);
  await node.hangUp(remotePeerId);
  log('Closed');
}

async function _subscribeToDebugTopic (node: Libp2p, peerHeartbeatChecker: PeerHearbeatChecker, metrics: PrometheusMetrics): Promise<void> {
  node.pubsub.subscribe(DEBUG_INFO_TOPIC);

  // Listen for pubsub messages
  node.pubsub.addEventListener('message', async (evt) => {
    const msg: Message = evt.detail;

    // Messages should be signed since globalSignaturePolicy is set to 'StrictSign'
    assert(msg.type === 'signed');

    if (msg.topic === DEBUG_INFO_TOPIC) {
      const dataObj = JSON.parse(uint8ArrayToString(msg.data));

      await debugInfoRequestHandler({
        node,
        getPeerInfo: async () => _getRelayPeerInfo(node, peerHeartbeatChecker, metrics),
        peerId: msg.from,
        msg: dataObj
      });
    }
  });
}

async function _getRelayPeerInfo (node: Libp2p, peerHeartbeatChecker: PeerHearbeatChecker, metrics: PrometheusMetrics): Promise<any> {
  const selfInfo: SelfInfo = getSelfInfo(node);
  const connInfo: ConnectionInfo[] = getConnectionsInfo(node, peerHeartbeatChecker);
  const metricsMap = await metrics.getMetricsAsMap();

  return {
    selfInfo,
    connInfo,
    metrics: metricsMap
  };
}
