//
// Copyright 2023 Vulcanize, Inc.
//

import * as mafmt from '@multiformats/mafmt';
import { uniqueNamesGenerator, adjectives, colors, names } from 'unique-names-generator';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import debug from 'debug';
import assert from 'assert';

import { Libp2p } from '@cerc-io/libp2p';
import { Multiaddr } from '@multiformats/multiaddr';
import type { PeerId } from '@libp2p/interface-peer-id';
import type { Connection } from '@libp2p/interface-connection';

import { ConnectionInfo, ConnectionType, DebugMsg, DebugPeerInfo, DebugResponse, SelfInfo } from '../types/debug-info.js';
import { DEBUG_INFO_TOPIC, P2P_WEBRTC_STAR_ID } from '../constants.js';
import { PeerHearbeatChecker } from '../peer-heartbeat-checker.js';

const log = debug('laconic:utils');

// p2p multi-address codes
export const CODE_P2P = 421;
export const CODE_CIRCUIT = 290;

interface DialWithRetryOptions {
  redialInterval: number
  maxRetry: number
}

const DEFAULT_DIAL_RETRY_OPTIONS: DialWithRetryOptions = {
  redialInterval: 5000, // ms
  maxRetry: 5
};

/**
 * Method to dial remote peer multiaddr with retry on failure
 * Number of retries can be configured using options.maxRetry
 * @param node
 * @param multiaddr
 * @param options
 */
export const dialWithRetry = async (node: Libp2p, multiaddr: Multiaddr, options: Partial<DialWithRetryOptions>): Promise<Connection> => {
  const { redialInterval, maxRetry } = {
    ...DEFAULT_DIAL_RETRY_OPTIONS,
    ...options
  };

  // Keep dialling node until it connects
  for (let i = 0; i < maxRetry; i++) {
    const peerId = multiaddr.getPeerId();
    assert(peerId);

    try {
      log(`Dialling node ${peerId} (${getPseudonymForPeerId(peerId.toString())}) using multiaddr ${multiaddr.toString()}`);
      const connection = await node.dial(multiaddr);

      return connection;
    } catch (err) {
      log(`Could not dial node ${multiaddr.toString()} (${getPseudonymForPeerId(peerId.toString())})`, err);
      log(`Retrying after ${redialInterval}ms`);

      // TODO: Use wait method from util package.
      // Issue using util package in react app.
      await new Promise(resolve => setTimeout(resolve, redialInterval));
    }
  }

  throw new Error(`Stopping dial retry after ${maxRetry} attempts for multiaddr ${multiaddr.toString()}`);
};

/**
 * Get a deterministic pseudonym of form [adjective-color-name] for a given libp2p peer id
 * Eg. 12D3KooWJLXEX2GfHPSZR3z9QKNSN8EY6pXo7FZ9XtFhiKLJATtC -> jolly-green-diann
 * @param peerId
 */
export const getPseudonymForPeerId = (peerId: string): string => {
  return uniqueNamesGenerator({
    seed: peerId,
    dictionaries: [adjectives, colors, names],
    length: 3,
    style: 'lowerCase',
    separator: '-'
  });
};

/**
 * Handler for pubsub debug info request
 * @param peerId
 * @param msg
 */
export const debugInfoRequestHandler = async (
  params: {
    node: Libp2p,
    getPeerInfo: () => Promise<DebugPeerInfo>
    peerId: PeerId,
    msg: any,
}): Promise<void> => {
  const { node, peerId, msg, getPeerInfo } = params;
  const debugMsg = msg as DebugMsg;
  const msgType = debugMsg.type;

  if (msgType === 'Request') {
    log('got a debug info request from', peerId.toString(), `(${getPseudonymForPeerId(peerId.toString())})`);
    const peerInfo: DebugPeerInfo = await getPeerInfo();
    const response: DebugResponse = {
      type: 'Response',
      dst: peerId.toString(),
      peerInfo
    };

    await node.pubsub.publish(DEBUG_INFO_TOPIC, uint8ArrayFromString(JSON.stringify(response)));
  }
};

/**
 * Method to get self node info
 * @param node
 * @returns
 */
export const getSelfInfo = (node: Libp2p): SelfInfo => {
  return {
    peerId: node.peerId.toString(),
    multiaddrs: node.getMultiaddrs().map(multiaddr => multiaddr.toString())
  };
};

/**
 * Method to get connections info
 * @param node
 * @param peerHeartbeatChecker
 * @returns
 */
export const getConnectionsInfo = (node: Libp2p, peerHeartbeatChecker: PeerHearbeatChecker): ConnectionInfo[] => {
  return node.getConnections().map(connection => {
    return {
      id: connection.id,
      peerId: connection.remotePeer.toString(),
      multiaddr: connection.remoteAddr.toString(),
      direction: connection.stat.direction,
      status: connection.stat.status,
      type: connection.remoteAddr.toString().includes('p2p-circuit/p2p') ? ConnectionType.Relayed : ConnectionType.Direct,
      latency: peerHeartbeatChecker.getLatencyData(connection.remotePeer)
    };
  });
};

export const wsPeerFilter = (multiaddrs: Multiaddr[]): Multiaddr[] => {
  return multiaddrs.filter((ma) => {
    if (ma.protoCodes().includes(CODE_CIRCUIT)) {
      return false;
    }

    if (ma.protoNames().includes(P2P_WEBRTC_STAR_ID)) {
      return false;
    }

    const testMa = ma.decapsulateCode(CODE_P2P);

    return mafmt.WebSockets.matches(testMa) ||
      mafmt.WebSocketsSecure.matches(testMa);
  });
};
