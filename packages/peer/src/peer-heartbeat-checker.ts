//
// Copyright 2023 Vulcanize, Inc.
//

import { Libp2p } from '@cerc-io/libp2p';
import type { PeerId } from '@libp2p/interface-peer-id';

import { CONN_CHECK_INTERVAL } from './constants.js';

/**
 * Used for tracking heartbeat of connected remote peers
 */
export class PeerHearbeatChecker {
  _node: Libp2p;
  _peerHeartbeatIntervalIdsMap: Map<string, NodeJS.Timer> = new Map();

  constructor (node: Libp2p) {
    this._node = node;
  }

  /**
   * Method to start heartbeat checks for a peer
   * @param peerId
   * @param handleDisconnect
   */
  async start (peerId: PeerId, handleDisconnect: () => Promise<void>): Promise<void> {
    if (this._peerHeartbeatIntervalIdsMap.has(peerId.toString())) {
      // Do not start connection check interval if already present
      return;
    }

    const intervalId = setInterval(async () => {
      await this._validatePing(
        peerId,
        async () => {
          // Check if connection check interval for peer is already cleared
          if (!this._peerHeartbeatIntervalIdsMap.has(peerId.toString())) {
            return;
          }

          // Clear and remove check interval for remote peer if not connected
          this.stop(peerId);

          await handleDisconnect();
        }
      );
    }, CONN_CHECK_INTERVAL);

    this._peerHeartbeatIntervalIdsMap.set(peerId.toString(), intervalId);
  }

  /**
   * Method to check connection using ping request
   * @param peerId
   * @param handleDisconnect
   */
  async _validatePing (peerId: PeerId, handleDisconnect: () => Promise<void>): Promise<void> {
    try {
      // Ping remote peer
      await this._node.ping(peerId);
    } catch (err) {
      // On error i.e. no pong
      console.log(`Not connected to peer ${peerId.toString()}`);

      await handleDisconnect();
    }
  }

  /**
   * Method to stop heartbeat checks for a peer
   * @param peerId
   */
  stop (peerId: PeerId): void {
    // Clear check interval for disconnected peer
    const intervalId = this._peerHeartbeatIntervalIdsMap.get(peerId.toString());

    if (intervalId) {
      clearInterval(intervalId);
    }

    this._peerHeartbeatIntervalIdsMap.delete(peerId.toString());
  }
}
