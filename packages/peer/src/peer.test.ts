/* eslint-disable no-unused-expressions */

import * as dotenv from 'dotenv';
import path from 'path';
import 'mocha';
import assert from 'assert';
import { expect } from 'chai';
import { pEvent } from 'p-event';
import debug from 'debug';

import { Connection } from '@libp2p/interface-connection';
import { multiaddr } from '@multiformats/multiaddr';

import { Peer } from './peer.js';

const log = debug('laconic:test');

const PEER_CONNECTION_TIMEOUT = 15 * 1000; // 15s

// Get relay node address from the .env file
dotenv.config({ path: path.resolve('./.env') });

describe('basic p2p tests', () => {
  let peers: Peer[];
  const relayMultiAddr = process.env.RELAY;

  it('peers get initialized', async () => {
    assert(relayMultiAddr, 'Relay multiaddr not provided');

    peers = [
      new Peer(relayMultiAddr, true),
      new Peer(relayMultiAddr, true)
    ];

    await Promise.all(peers.map(async (peer) => {
      await peer.init({});
    }));
  });

  it('peers get connected to the primary relay node', async () => {
    await Promise.all(peers.map(async (peer) => {
      assert(peer.node);

      // Wait for a connection to be established
      await pEvent(peer.node, 'peer:connect');

      const connections = peer.node.getConnections();
      assert(connections, 'No peer connections found');

      const expectedPeerId = multiaddr(relayMultiAddr).getPeerId()?.toString();
      const connectedPeerIds = connections?.map(connection => connection.remotePeer.toString());

      expect(connectedPeerIds).to.include(expectedPeerId);
    }));
  });

  it('peers discover and get connected to each other', async () => {
    const connectionPromises = peers.map(async (peer, index) => {
      assert(peer.node);

      const otherPeersId = peers[1 - index].node?.peerId.toString();

      return new Promise<void>((resolve, reject) => {
        // Resolve if already connected to the other peer
        const alreadyConnected = peer.node?.getPeers().some(peerId => peerId.toString() === otherPeersId);
        if (alreadyConnected) {
          resolve();
        }

        peer.node?.addEventListener('peer:connect', async (event) => {
          const connection: Connection = event.detail;

          // Resolve after getting connected to the other peer
          if (connection.remotePeer.toString() === otherPeersId) {
            resolve();
          }
        });

        setTimeout(() => {
          reject(new Error('Peer connection timed out'));
        }, PEER_CONNECTION_TIMEOUT);
      });
    });

    await Promise.all(connectionPromises);
  });

  it('peers are able to communicate over a topic', async () => {
    const pubSubTopic = 'dummy-topic';

    const msgFromPeer1 = 'Hello from peer1';
    const msgFromPeer2 = 'Hello from peer2';
    let messageReceivedByPeer1 = false;
    let messageReceivedByPeer2 = false;

    peers[0].subscribeTopic(pubSubTopic, (peerId, data) => {
      if (data === msgFromPeer2) {
        messageReceivedByPeer1 = true;
      }
      log(`${peerId.toString()} > ${data}`);
    });
    peers[1].subscribeTopic(pubSubTopic, (peerId, data) => {
      if (data === msgFromPeer1) {
        messageReceivedByPeer2 = true;
      }
      log(`${peerId.toString()} > ${data}`);
    });

    // Wait for the connection between peers to be stabilized
    // Peers upgrade to a direct connection from a relayed one if possible
    await sleep(3000);

    peers[0].floodMessage(pubSubTopic, msgFromPeer1);
    peers[1].floodMessage(pubSubTopic, msgFromPeer2);

    await sleep(2000);

    expect(messageReceivedByPeer1).to.be.true;
    expect(messageReceivedByPeer2).to.be.true;
  });

  after('cleanup', async () => {
    // Doing peer.close() runs into the following error:
    //  Pure virtual function called!
    //  Aborted (core dumped)
    // So just exit the process to stop the peers
    process.exit(0);
  });
});

function sleep (ms : number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
