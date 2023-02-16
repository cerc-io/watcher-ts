//
// Copyright 2023 Vulcanize, Inc.
//

import { Libp2p } from '@cerc-io/libp2p';
import type { PeerId } from '@libp2p/interface-peer-id';

import { CONN_CHECK_INTERVAL } from './constants.js';

interface PeerData {
  intervalId: NodeJS.Timer;
  latencyValues: Array<number>;
}

/**
 * Used for tracking heartbeat of connected remote peers
 */
export class PeerHearbeatChecker {
  _node: Libp2p;
  _peerMap: Map<string, PeerData> = new Map()

  constructor (node: Libp2p) {
    this._node = node;
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
    }, CONN_CHECK_INTERVAL);

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
    try {
      // Ping remote peer
      const latency = await this._node.ping(peerId);

      const latencyValues = this._peerMap.get(peerId.toString())?.latencyValues;

      if (latencyValues) {
        const length = latencyValues.unshift(latency);

        if (length > 5) {
          latencyValues.pop();
        }
      }
    } catch (err) {
      // On error i.e. no pong
      console.log(`Not connected to peer ${peerId.toString()}`);

      await handleDisconnect();
    }
  }
}
