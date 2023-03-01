//
// Copyright 2022 Vulcanize, Inc.
//

import { Libp2p, createLibp2p } from '@cerc-io/libp2p';
import wrtc from 'wrtc';
import debug from 'debug';
import assert from 'assert';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';

import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { WebRTCDirectNodeType, webRTCDirect } from '@cerc-io/webrtc-direct';
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
  WEBRTC_PORT_RANGE,
  MAX_CONCURRENT_DIALS_PER_PEER,
  DEBUG_INFO_TOPIC
} from './constants.js';
import { PeerHearbeatChecker } from './peer-heartbeat-checker.js';
import { dialWithRetry } from './utils/index.js';
import { PeerIdObj } from './peer.js';
import { SelfInfo, ConnectionInfo, DebugMsg, DebugRelayInfo, DebugResponse } from './types/debug-info.js';

const log = debug('laconic:relay');

export interface RelayNodeInitConfig {
  host: string;
  port: number;
  peerIdObj?: PeerIdObj;
  announceDomain?: string;
  relayPeers: string[];
  dialTimeout: number;
  pingInterval: number;
  pingTimeout?: number;
  redialInterval: number;
  maxDialRetry: number;
  enableDebugInfo?: boolean;
}

export async function createRelayNode (init: RelayNodeInitConfig): Promise<Libp2p> {
  const listenMultiaddrs = [`/ip4/${init.host}/tcp/${init.port}/http/p2p-webrtc-direct`];
  const announceMultiaddrs = [];

  if (init.announceDomain) {
    announceMultiaddrs.push(`/dns4/${init.announceDomain}/tcp/443/https/p2p-webrtc-direct`);
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
      maxDialsPerPeer: MAX_CONCURRENT_DIALS_PER_PEER,
      autoDial: false,
      dialTimeout: init.dialTimeout
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

  log(`Relay node started with id ${node.peerId.toString()}`);
  log('Listening on:');
  node.getMultiaddrs().forEach((ma) => log(ma.toString()));

  // Listen for peers connection
  node.addEventListener('peer:connect', async (evt) => {
    // log('event peer:connect', evt);
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
    // log('event peer:disconnect', evt);

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
          redialInterval: init.redialInterval,
          maxRetry: init.maxDialRetry
        }
      ).catch((error: Error) => log(error.message));
    }
  });

  if (init.relayPeers.length) {
    log('Dialling relay peers');
    await _dialRelayPeers(node, init.relayPeers, init.maxDialRetry, init.redialInterval);
  }

  if (init.enableDebugInfo) {
    log('Debug info enabled');
    await _subscribeToDebugTopic(node, peerHeartbeatChecker, metrics);
  }

  return node;
}

async function _dialRelayPeers (node: Libp2p, relayPeersList: string[], maxDialRetry: number, redialInterval: number): Promise<void> {
  relayPeersList.forEach(async (relayPeer) => {
    const relayMultiaddr = multiaddr(relayPeer);
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
  log(`Closing connections for ${remotePeerId}`);
  await node.hangUp(remotePeerId);
  log('Closed');
}

async function _subscribeToDebugTopic (node: Libp2p, peerHeartbeatChecker: PeerHearbeatChecker, metrics: PrometheusMetrics): Promise<void> {
  node.pubsub.subscribe(DEBUG_INFO_TOPIC);

  const debugInfoRequestHandler = async (peerId: PeerId, msg: any): Promise<void> => {
    const debugMsg = msg as DebugMsg;
    const msgType = debugMsg.type;

    if (msgType === 'Request') {
      const peerInfo: DebugRelayInfo = await _getRelayPeerInfo(node, peerHeartbeatChecker, metrics);
      const response: DebugResponse = {
        type: 'Response',
        dst: peerId.toString(),
        peerInfo
      };

      await node.pubsub.publish(DEBUG_INFO_TOPIC, uint8ArrayFromString(JSON.stringify(response)));
    }
  };

  // Listen for pubsub messages
  node.pubsub.addEventListener('message', (evt) => {
    const msg: Message = evt.detail;

    // Messages should be signed since globalSignaturePolicy is set to 'StrictSign'
    assert(msg.type === 'signed');

    if (msg.topic === DEBUG_INFO_TOPIC) {
      const dataObj = JSON.parse(uint8ArrayToString(msg.data));
      debugInfoRequestHandler(msg.from, dataObj);
    }
  });
}

async function _getRelayPeerInfo (node: Libp2p, peerHeartbeatChecker: PeerHearbeatChecker, metrics: PrometheusMetrics): Promise<any> {
  const selfInfo: SelfInfo = {
    peerId: node.peerId.toString(),
    multiaddrs: node.getMultiaddrs().map(multiaddr => multiaddr.toString())
  };

  const connInfo: ConnectionInfo[] = node.getConnections().map(connection => {
    return {
      id: connection.id,
      peerId: connection.remotePeer.toString(),
      multiaddr: connection.remoteAddr.toString(),
      direction: connection.stat.direction,
      status: connection.stat.status,
      type: connection.remoteAddr.toString().includes('p2p-circuit/p2p') ? 'relayed' : 'direct',
      latency: peerHeartbeatChecker.getLatencyData(connection.remotePeer)
    };
  });

  const metricsMap = await metrics.getMetricsAsMap();

  return {
    selfInfo,
    connInfo,
    metrics: metricsMap
  };
}
