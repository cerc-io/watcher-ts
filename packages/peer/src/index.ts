//
// Copyright 2022 Vulcanize, Inc.
//

import { createLibp2p, Libp2p } from 'libp2p';
// For nodejs.
import wrtc from 'wrtc';
import assert from 'assert';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import map from 'it-map';
import { pushable, Pushable } from 'it-pushable';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';

import { webRTCStar, WebRTCStarTuple } from '@libp2p/webrtc-star';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import type { Stream as P2PStream, Connection } from '@libp2p/interface-connection';
import type { PeerInfo } from '@libp2p/interface-peer-info';
import type { Message } from '@libp2p/interface-pubsub';
import type { PeerId } from '@libp2p/interface-peer-id';
import { multiaddr, Multiaddr } from '@multiformats/multiaddr';
import { floodsub } from '@libp2p/floodsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';

import { MAX_CONCURRENT_DIALS_PER_PEER, MAX_CONNECTIONS, MIN_CONNECTIONS, PUBSUB_DISCOVERY_INTERVAL, PUBSUB_SIGNATURE_POLICY, RELAY_TAG, RELAY_REDIAL_DELAY, CONN_CHECK_INTERVAL, PING_TIMEOUT } from './constants.js';

export const CHAT_PROTOCOL = '/chat/1.0.0';
export const DEFAULT_SIGNAL_SERVER_URL = '/ip4/127.0.0.1/tcp/13579/wss/p2p-webrtc-star';

export const ERR_PROTOCOL_SELECTION = 'protocol selection failed';

export class Peer {
  _node?: Libp2p
  _wrtcStar: WebRTCStarTuple
  _relayNodeMultiaddr?: Multiaddr

  _peerStreamMap: Map<string, Pushable<any>> = new Map()
  _messageHandlers: Array<(peerId: PeerId, message: any) => void> = []
  _topicHandlers: Map<string, Array<(peerId: PeerId, data: any) => void>> = new Map()
  _peerHeartbeatIntervalIdsMap: Map<string, NodeJS.Timer> = new Map();

  constructor (nodejs?: boolean) {
    // Instantiation in nodejs.
    if (nodejs) {
      this._wrtcStar = webRTCStar({ wrtc });
    } else {
      this._wrtcStar = webRTCStar();
    }
  }

  get peerId (): PeerId | undefined {
    return this._node?.peerId;
  }

  get node (): Libp2p | undefined {
    return this._node;
  }

  async init (signalServerURL = DEFAULT_SIGNAL_SERVER_URL, relayNodeURL?: string): Promise<void> {
    let peerDiscovery: any;
    if (relayNodeURL) {
      this._relayNodeMultiaddr = multiaddr(relayNodeURL);

      peerDiscovery = [
        pubsubPeerDiscovery({
          interval: PUBSUB_DISCOVERY_INTERVAL
        })
      ];
    } else {
      peerDiscovery = [this._wrtcStar.discovery];
    }

    this._node = await createLibp2p({
      addresses: {
        // Add the signaling server address, along with our PeerId to our multiaddrs list
        // libp2p will automatically attempt to dial to the signaling server so that it can
        // receive inbound connections from other peers
        listen: [
          // Public signal servers
          // '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
          // '/dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star'
          signalServerURL
        ]
      },
      transports: [
        this._wrtcStar.transport
      ],
      connectionEncryption: [noise()],
      streamMuxers: [mplex()],
      pubsub: floodsub({ globalSignaturePolicy: PUBSUB_SIGNATURE_POLICY }),
      peerDiscovery,
      relay: {
        enabled: true,
        autoRelay: {
          enabled: true,
          maxListeners: 2
        }
      },
      connectionManager: {
        maxDialsPerPeer: MAX_CONCURRENT_DIALS_PER_PEER, // Number of max concurrent dials per peer
        autoDial: false,
        maxConnections: MAX_CONNECTIONS,
        minConnections: MIN_CONNECTIONS
      },
      ping: {
        timeout: PING_TIMEOUT
      }
    });

    console.log('libp2p node created', this._node);

    // Dial to the HOP enabled relay node if available
    if (this._relayNodeMultiaddr) {
      await this._dialRelay();
    }

    // Listen for change in stored multiaddrs
    this._node.peerStore.addEventListener('change:multiaddrs', (evt) => {
      assert(this._node);
      const { peerId, multiaddrs } = evt.detail;

      // Log updated self multiaddrs
      if (peerId.equals(this._node.peerId)) {
        console.log('Updated self multiaddrs', this._node.getMultiaddrs().map(addr => addr.toString()));
      } else {
        console.log('Updated peer node multiaddrs', multiaddrs.map((addr: Multiaddr) => addr.toString()));
      }
    });

    // Listen for peers discovery
    this._node.addEventListener('peer:discovery', (evt) => {
      // console.log('event peer:discovery', evt);
      this._handleDiscovery(evt.detail);
    });

    // Listen for peers connection
    this._node.addEventListener('peer:connect', async (evt) => {
      console.log('event peer:connect', evt);
      await this._handleConnect(evt.detail);
    });

    // Listen for peers disconnecting
    this._node.addEventListener('peer:disconnect', (evt) => {
      console.log('event peer:disconnect', evt);
      this._handleDisconnect(evt.detail);
    });

    // Handle messages for the protocol
    await this._node.handle(CHAT_PROTOCOL, async ({ stream, connection }) => {
      this._handleStream(connection.remotePeer, stream);
    });

    // Listen for pubsub messages
    this._node.pubsub.addEventListener('message', (evt) => {
      this._handleMessage(evt.detail);
    });
  }

  async close (): Promise<void> {
    assert(this._node);

    this._node.removeEventListener('peer:discovery');
    this._node.removeEventListener('peer:connect');
    this._node.removeEventListener('peer:disconnect');
    this._node.pubsub.removeEventListener('message');

    await this._node.unhandle(CHAT_PROTOCOL);
    const remotePeerIds = this._node.getPeers();
    remotePeerIds.forEach(remotePeerId => this._stopHeartbeatChecks(remotePeerId));
    const hangUpPromises = remotePeerIds.map(async peerId => this._node?.hangUp(peerId));
    await Promise.all(hangUpPromises);
  }

  broadcastMessage (message: any): void {
    for (const [, stream] of this._peerStreamMap) {
      stream.push(message);
    }
  }

  async floodMessage (topic: string, msg: any): Promise<void> {
    assert(this._node);
    await this._node.pubsub.publish(topic, uint8ArrayFromString(JSON.stringify(msg)));
  }

  subscribeMessage (handler: (peerId: PeerId, message: any) => void) : () => void {
    this._messageHandlers.push(handler);

    const unsubscribe = () => {
      this._messageHandlers = this._messageHandlers
        .filter(registeredHandler => registeredHandler !== handler);
    };

    return unsubscribe;
  }

  subscribeTopic (topic: string, handler: (peerId: PeerId, data: any) => void): () => void {
    assert(this._node);

    // Subscribe node to the topic
    this._node.pubsub.subscribe(topic);

    // Register provided handler for the topic
    if (!this._topicHandlers.has(topic)) {
      this._topicHandlers.set(topic, [handler]);
    } else {
      this._topicHandlers.get(topic)?.push(handler);
    }

    // Create a unsubscribe callback
    const unsubscribe = () => {
      // Remove handler from registered handlers for the topic
      const filteredTopicHandlers = this._topicHandlers.get(topic)
        ?.filter(registeredHandler => registeredHandler !== handler);

      if (filteredTopicHandlers?.length) {
        this._topicHandlers.set(topic, filteredTopicHandlers);
      } else {
        // Remove topic from map and unsubscribe node from the topic if no handlers left
        this._topicHandlers.delete(topic);
        this._node?.pubsub.unsubscribe(topic);
      }
    };

    return unsubscribe;
  }

  async _dialRelay (): Promise<void> {
    assert(this._relayNodeMultiaddr);
    assert(this._node);
    const relayMultiaddr = this._relayNodeMultiaddr;

    // Keep dialling relay node until it connects
    while (true) {
      try {
        console.log(`Dialling relay node ${relayMultiaddr.getPeerId()} using multiaddr ${relayMultiaddr.toString()}`);
        const connection = await this._node.dial(relayMultiaddr);
        const relayPeerId = connection.remotePeer;

        // TODO: Check if tag already exists. When checking tags issue with relay node connect event
        // Tag the relay node with a high value to prioritize it's connection
        // in connection pruning on crossing peer's maxConnections limit
        this._node.peerStore.tagPeer(relayPeerId, RELAY_TAG.tag, { value: RELAY_TAG.value });

        break;
      } catch (err) {
        console.log(`Could not dial relay ${relayMultiaddr.toString()}`, err);

        // TODO: Use wait method from util package.
        // Issue using util package in react app.
        await new Promise(resolve => setTimeout(resolve, RELAY_REDIAL_DELAY));
      }
    }
  }

  _handleDiscovery (peer: PeerInfo): void {
    // Check connected peers as they are discovered repeatedly.
    if (!this._node?.getPeers().some(remotePeerId => remotePeerId.toString() === peer.id.toString())) {
      console.log(`Discovered peer ${peer.id.toString()} with multiaddrs`, peer.multiaddrs.map(addr => addr.toString()));
      this._connectPeer(peer);
    }
  }

  async _handleConnect (connection: Connection): Promise<void> {
    const remotePeerId = connection.remotePeer;

    // Log connected peer
    console.log(`Connected to ${remotePeerId.toString()} using multiaddr ${connection.remoteAddr.toString()}`);
    console.log(`Current number of peers connected: ${this._node?.getPeers().length}`);

    // Start heartbeat check peer
    await this._startHeartbeatChecks(
      remotePeerId,
      async () => this._handleDeadConnections(remotePeerId)
    );
  }

  async _handleDeadConnections (remotePeerId: PeerId) {
    // Close existing connections of remote peer
    console.log(`Closing connections for ${remotePeerId}`);
    await this._node?.hangUp(remotePeerId);
    console.log('Closed');
  }

  async _startHeartbeatChecks (peerId: PeerId, handleDisconnect: () => Promise<void>): Promise<void> {
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
          this._stopHeartbeatChecks(peerId);

          await handleDisconnect();
        }
      );
    }, CONN_CHECK_INTERVAL);

    this._peerHeartbeatIntervalIdsMap.set(peerId.toString(), intervalId);
  }

  async _validatePing (peerId: PeerId, handleDisconnect: () => Promise<void>): Promise<void> {
    assert(this._node);

    try {
      // Ping remote peer
      await this._node.ping(peerId);
    } catch (err) {
      // On error i.e. no pong
      console.log(`Not connected to peer ${peerId.toString()}`);

      await handleDisconnect();
    }
  }

  async _handleDisconnect (connection: Connection): Promise<void> {
    assert(this._node);
    const disconnectedPeerId = connection.remotePeer;

    // Log disconnected peer
    console.log(`Disconnected from ${disconnectedPeerId.toString()} using multiaddr ${connection.remoteAddr.toString()}`);
    console.log(`Current number of peers connected: ${this._node?.getPeers().length}`);

    const peerConnections = this._node.getConnections(disconnectedPeerId);

    if (!peerConnections.length) {
      // Stop connection check for disconnected peer
      this._stopHeartbeatChecks(disconnectedPeerId);

      if (disconnectedPeerId.toString() === this._relayNodeMultiaddr?.getPeerId()) {
        // Reconnect to relay node if disconnected
        await this._dialRelay();
      }
    }
  }

  _stopHeartbeatChecks (peerId: PeerId): void {
    // Clear check interval for disconnected peer
    const intervalId = this._peerHeartbeatIntervalIdsMap.get(peerId.toString());

    if (intervalId) {
      clearInterval(intervalId);
    }

    this._peerHeartbeatIntervalIdsMap.delete(peerId.toString());
  }

  async _connectPeer (peer: PeerInfo): Promise<void> {
    assert(this._node);

    // Dial them when we discover them
    const peerIdString = peer.id.toString();
    try {
      console.log(`Dialling peer ${peerIdString}`);
      // When dialling with peer id, all multiaddr(s) (direct/relayed) of the discovered peer are dialled in parallel
      const stream = await this._node.dialProtocol(peer.id, CHAT_PROTOCOL);
      this._handleStream(peer.id, stream);
    } catch (err: any) {
      // Check if protocol negotiation failed (dial still succeeds)
      // (happens in case of dialProtocol to relay nodes since they don't handle CHAT_PROTOCOL)
      if ((err as Error).message === ERR_PROTOCOL_SELECTION) {
        console.log(`Protocol selection failed with peer ${peerIdString}`);
      } else {
        console.log(`Could not dial ${peerIdString}`, err);
      }
    }
  }

  _handleStream (peerId: PeerId, stream: P2PStream): void {
    // console.log('Stream after connection', stream);
    const messageStream = pushable<any>({ objectMode: true });

    // Send message to pipe from stdin
    pipe(
      // Read from stream (the source)
      messageStream,
      // Turn objects into buffers
      (source) => map(source, (value) => {
        return uint8ArrayFromString(JSON.stringify(value));
      }),
      // Encode with length prefix (so receiving side knows how much data is coming)
      lp.encode(),
      // Write to the stream (the sink)
      stream.sink
    );

    // Handle message from stream
    pipe(
      // Read from the stream (the source)
      stream.source,
      // Decode length-prefixed data
      lp.decode(),
      // Turn buffers into objects
      (source) => map(source, (buf) => {
        return JSON.parse(uint8ArrayToString(buf.subarray()));
      }),
      // Sink function
      async (source) => {
        // For each chunk of data
        for await (const msg of source) {
          this._messageHandlers.forEach(messageHandler => messageHandler(peerId, msg));
        }
      }
    );

    // TODO: Check if stream already exists for peer id
    this._peerStreamMap.set(peerId.toString(), messageStream);
  }

  _handleMessage (msg: Message): void {
    // Messages should be signed since globalSignaturePolicy is set to 'StrictSign'
    assert(msg.type === 'signed');

    // Send msg data to registered topic handlers
    this._topicHandlers.get(msg.topic)?.forEach(handler => {
      const dataObj = JSON.parse(uint8ArrayToString(msg.data));
      handler(msg.from, dataObj);
    });
  }
}
