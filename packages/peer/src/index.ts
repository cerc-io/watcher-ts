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
import { PeerId } from '@libp2p/interface-peer-id';
import { multiaddr, Multiaddr } from '@multiformats/multiaddr';
import { floodsub } from '@libp2p/floodsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';

import { MAX_CONNECTIONS, MAX_DIALS_PER_PEER, MIN_CONNECTIONS, PUBSUB_DISCOVERY_INTERVAL, PUBSUB_SIGNATURE_POLICY, RELAY_TAG } from './constants.js';

export const CHAT_PROTOCOL = '/chat/1.0.0';
export const DEFAULT_SIGNAL_SERVER_URL = '/ip4/127.0.0.1/tcp/13579/wss/p2p-webrtc-star';

export const ERR_PROTOCOL_SELECTION = 'protocol selection failed';

export class Peer {
  _node?: Libp2p
  _wrtcStar: WebRTCStarTuple
  _relayNodeMultiaddr?: Multiaddr

  _remotePeerIds: PeerId[] = []
  _peerStreamMap: Map<string, Pushable<any>> = new Map()
  _messageHandlers: Array<(peerId: PeerId, message: any) => void> = []
  _topicHandlers: Map<string, Array<(peerId: PeerId, data: any) => void>> = new Map()

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
        maxDialsPerPeer: MAX_DIALS_PER_PEER, // Number of max concurrent dials per peer
        autoDial: false,
        maxConnections: MAX_CONNECTIONS,
        minConnections: MIN_CONNECTIONS
      }
    });

    console.log('libp2p node created', this._node);

    // Dial to the HOP enabled relay node if available
    if (this._relayNodeMultiaddr) {
      const relayMultiaddr = this._relayNodeMultiaddr;

      console.log(`Dialling relay node ${relayMultiaddr.getPeerId()} using multiaddr ${relayMultiaddr.toString()}`);
      await this._node.dial(relayMultiaddr);

      // Tag the relay node with a high value to avoid disconnect on crossing maxConnections limit
      const relayPeerId = this._node.getPeers().find(
        peerId => peerId.toString() === relayMultiaddr.getPeerId()
      );
      assert(relayPeerId);
      this._node.peerStore.tagPeer(relayPeerId, RELAY_TAG.tag, { value: RELAY_TAG.value });
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
    this._node.connectionManager.addEventListener('peer:connect', (evt) => {
      console.log('event peer:connect', evt);
      this._handleConnect(evt.detail);
    });

    // Listen for peers disconnecting
    this._node.connectionManager.addEventListener('peer:disconnect', (evt) => {
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
    this._node.connectionManager.removeEventListener('peer:connect');
    this._node.connectionManager.removeEventListener('peer:disconnect');
    this._node.pubsub.removeEventListener('message');

    await this._node.unhandle(CHAT_PROTOCOL);
    const hangUpPromises = this._remotePeerIds.map(async peerId => this._node?.hangUp(peerId));
    await Promise.all(hangUpPromises);
  }

  broadcastMessage (message: any): void {
    for (const [, stream] of this._peerStreamMap) {
      stream.push(message);
    }
  }

  floodMessage (topic: string, msg: any): void {
    assert(this._node);
    this._node.pubsub.publish(topic, uint8ArrayFromString(JSON.stringify(msg)));
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

  _handleDiscovery (peer: PeerInfo): void {
    // Check connected peers as they are discovered repeatedly.
    if (!this._remotePeerIds.some(remotePeerId => remotePeerId.toString() === peer.id.toString())) {
      console.log('Discovered peer multiaddrs', peer.multiaddrs.map(addr => addr.toString()));
      this._connectPeer(peer);
    }
  }

  _handleConnect (connection: Connection): void {
    const remotePeerId = connection.remotePeer;
    this._remotePeerIds.push(remotePeerId);

    // Log connected peer
    console.log(`Connected to ${remotePeerId.toString()} using multiaddr ${connection.remoteAddr.toString()}`);
    console.log(`Current number of peers connected: ${this._node?.getPeers().length}`);
  }

  _handleDisconnect (connection: Connection): void {
    const disconnectedPeerId = connection.remotePeer;
    this._remotePeerIds = this._remotePeerIds.filter(remotePeerId => remotePeerId.toString() !== disconnectedPeerId.toString());

    // Log disconnected peer
    console.log(`Disconnected from ${disconnectedPeerId.toString()} using multiaddr ${connection.remoteAddr.toString()}`);
    console.log(`Current number of peers connected: ${this._node?.getPeers().length}`);
  }

  async _connectPeer (peer: PeerInfo): Promise<void> {
    assert(this._node);

    // Dial them when we discover them
    // Attempt to dial all the multiaddrs of the discovered peer (to connect through relay)
    for (const peerMultiaddr of peer.multiaddrs) {
      // Avoid incomplete multiaddr
      if (!peerMultiaddr.toString().includes('p2p/')) {
        continue;
      }

      try {
        console.log(`Dialling peer ${peer.id.toString()} using multiaddr ${peerMultiaddr.toString()}`);
        const stream = await this._node.dialProtocol(peerMultiaddr, CHAT_PROTOCOL);

        this._handleStream(peer.id, stream);
        break;
      } catch (err: any) {
        // Check if protocol negotiation failed (in case of relay nodes)
        if ((err as Error).message === ERR_PROTOCOL_SELECTION) {
          console.log(`Protocol selection failed with peer ${peerMultiaddr}`);
          break;
        } else {
          console.log(`Could not dial ${peerMultiaddr.toString()}`, err);
        }
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
