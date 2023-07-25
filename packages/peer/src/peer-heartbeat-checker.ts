//
// Copyright 2023 Vulcanize, Inc.
//

import { Libp2p } from '@cerc-io/libp2p';
import type { PeerId } from '@libp2p/interface-peer-id';
import debug from 'debug';

import { DEFAULT_PING_INTERVAL, DEFAULT_PING_TIMEOUT } from './constants.js';
import { getPseudonymForPeerId } from './utils/index.js';

const log = debug('laconic:peer-heartbeat-checker');

export const MUXER_CLOSED_ERR = 'Muxer already closed';

interface PeerData {
  intervalId: NodeJS.Timer;
  latencyValues: Array<number>;
}

interface PeerHearbeatCheckerOptions {
  pingInterval: number;
  pingTimeout: number;
}

/**
 * Used for tracking heartbeat of connected remote peers
 */
export class PeerHearbeatChecker {
  _node: Libp2p;
  _pingInterval: number;
  _pingTimeout: number;
  _peerMap: Map<string, PeerData> = new Map();

  constructor (node: Libp2p, options: Partial<PeerHearbeatCheckerOptions> = {}) {
    this._node = node;
    this._pingInterval = options.pingInterval ?? DEFAULT_PING_INTERVAL;
    this._pingTimeout = options.pingTimeout ?? DEFAULT_PING_TIMEOUT;
  }

  /**
   * Method to start heartbeat checks for a peer
   * @param peerId
   * @param handleDisconnect
   */
  async start (peerId: PeerId, handleDisconnect: () => Promise<void>): Promise<void> {
    const peerIdString = peerId.toString();

    if (this._peerMap.has(peerIdString)) {
      // Do not start connection check interval if already present
      return;
    }

    const handlePingDisconnect = async () => {
      // Check if connection check interval for peer is already cleared
      if (!this._peerMap.get(peerIdString)) {
        return;
      }

      // Clear and remove check interval for remote peer if not connected
      this.stop(peerId);

      await handleDisconnect();
    };

    const intervalId = setInterval(async () => {
      await this._validatePing(
        peerId,
        handlePingDisconnect
      );
    }, this._pingInterval);

    this._peerMap.set(
      peerIdString,
      {
        intervalId,
        latencyValues: []
      }
    );

    await this._validatePing(
      peerId,
      handlePingDisconnect
    );
  }

  /**
   * Method to stop heartbeat checks for a peer
   * @param peerId
   */
  stop (peerId: PeerId): void {
    // Clear check interval for disconnected peer
    const peerData = this._peerMap.get(peerId.toString());

    if (peerData) {
      clearInterval(peerData.intervalId);
    }

    this._peerMap.delete(peerId.toString());
  }

  /**
   * Get latency data for peer
   */
  getLatencyData (peerId: PeerId): Array<number> {
    const latencyValues = this._peerMap.get(peerId.toString())?.latencyValues;

    return latencyValues ?? [];
  }

  /**
   * Method to check connection using ping request
   * @param peerId
   * @param handleDisconnect
   */
  async _validatePing (peerId: PeerId, handleDisconnect: () => Promise<void>): Promise<void> {
    // Number of retries depends on the ping interval and ping timeout
    const pingRetriesOnFail = Math.floor(this._pingInterval / this._pingTimeout);
    let pingSuccess = false;

    // Loop to retry ping on failure and confirm that there is no connection
    // Loop breaks on a successful ping pong
    for (let i = 0; !pingSuccess && (i < pingRetriesOnFail); i++) {
      const retryDelayPromise = new Promise(resolve => setTimeout(resolve, this._pingTimeout));

      try {
        // Ping remote peer
        const latency = await this._node.ping(peerId);
        pingSuccess = true;

        const latencyValues = this._peerMap.get(peerId.toString())?.latencyValues;

        if (latencyValues) {
          // Update latency values with latest
          const length = latencyValues.unshift(latency);

          if (length > 5) {
            // Pop oldest latency value from list
            latencyValues.pop();
          }
        }
      } catch (err: any) {
        // On error i.e. no pong
        log(err?.message);

        const conns = this._node.getConnections(peerId);

        // If there are multiple connections to the peer and ping was being attempted on a dead connection,
        // forcefully close/cleanup that connection (always the first one)
        if (conns.length > 1 && err?.message.includes(MUXER_CLOSED_ERR)) {
          log(`Closing a dead connection ${conns[0].id} to peer ${peerId.toString()}`);
          await conns[0].close();

          // Don't count this attempt and do the next ping attempt immediately
          i--;
        } else {
          // Retry after a delay of pingTimeout in case ping fails
          await retryDelayPromise;
        }
      }
    }

    if (pingSuccess) {
      return;
    }

    log(`Not connected to peer ${peerId.toString()} (${getPseudonymForPeerId(peerId.toString())})`);
    await handleDisconnect();
  }
}
