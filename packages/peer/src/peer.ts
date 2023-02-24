//
// Copyright 2023 Vulcanize, Inc.
//

import { createLibp2p, Libp2p } from '@cerc-io/libp2p';
// For nodejs.
import wrtc from 'wrtc';
import assert from 'assert';
import { Buffer } from 'buffer';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import map from 'it-map';
import { pushable, Pushable } from 'it-pushable';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';

import { webRTCDirect, WebRTCDirectComponents, P2P_WEBRTC_STAR_ID, WebRTCDirectNodeType, WebRTCDirectInit } from '@cerc-io/webrtc-direct';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import type { Transport } from '@libp2p/interface-transport';
import type { Stream as P2PStream, Connection } from '@libp2p/interface-connection';
import type { PeerInfo } from '@libp2p/interface-peer-info';
import type { Message } from '@libp2p/interface-pubsub';
import type { PeerId } from '@libp2p/interface-peer-id';
import { createFromJSON, createEd25519PeerId } from '@libp2p/peer-id-factory';
import { multiaddr, Multiaddr } from '@multiformats/multiaddr';
import { floodsub } from '@libp2p/floodsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import { PrometheusMetrics } from '@cerc-io/prometheus-metrics';

import {
  MAX_CONCURRENT_DIALS_PER_PEER,
  MAX_CONNECTIONS,
  MIN_CONNECTIONS,
  DIAL_TIMEOUT,
  PUBSUB_DISCOVERY_INTERVAL,
  PUBSUB_SIGNATURE_POLICY,
  RELAY_TAG,
  RELAY_REDIAL_INTERVAL,
  DEFAULT_MAX_RELAY_CONNECTIONS,
  DEFAULT_PING_TIMEOUT,
  P2P_CIRCUIT_ID,
  CHAT_PROTOCOL,
  DEBUG_INFO_TOPIC
} from './constants.js';
import { PeerHearbeatChecker } from './peer-heartbeat-checker.js';
import { dialWithRetry } from './utils/index.js';
import { ConnectionInfo, DebugMsg, DebugPeerInfo, DebugRequest, DebugResponse, SelfInfo } from './utils/debug-info.js';

const ERR_PEER_ALREADY_TAGGED = 'Peer already tagged';

export interface PeerIdObj {
  id: string;
  privKey: string;
  pubKey: string;
}

export interface PeerInitConfig {
  pingInterval?: number;
  pingTimeout?: number;
  maxRelayConnections?: number;
  relayRedialInterval?: number;
  maxConnections?: number;
  minConnections?: number;
  dialTimeout?: number;
}

export class Peer {
  _node?: Libp2p
  _peerHeartbeatChecker?: PeerHearbeatChecker
  _wrtcTransport: (components: WebRTCDirectComponents) => Transport

  _relayNodeMultiaddr: Multiaddr
  _numRelayConnections = 0

  _relayRedialInterval?: number
  _maxRelayConnections?: number

_peerStreamMap: Map<string, Pushable<any>> = new Map()
  _messageHandlers: Array<(peerId: PeerId, message: any) => void> = []
  _topicHandlers: Map<string, Array<(peerId: PeerId, data: any) => void>> = new Map()
  _metrics = new PrometheusMetrics()

  constructor (relayNodeURL: string, nodejs?: boolean) {
    this._relayNodeMultiaddr = multiaddr(relayNodeURL);

    const relayPeerId = this._relayNodeMultiaddr.getPeerId();
    assert(relayPeerId);

    console.log(`Using peer ${relayPeerId.toString()} as the primary relay node`);

    const initOptions: WebRTCDirectInit = {
      wrtc: nodejs ? wrtc : undefined, // Instantiation in nodejs
      enableSignalling: true,
      nodeType: WebRTCDirectNodeType.Peer,
      relayPeerId
    };
    this._wrtcTransport = webRTCDirect(initOptions);
  }

  get peerId (): PeerId | undefined {
    return this._node?.peerId;
  }

  get node (): Libp2p | undefined {
    return this._node;
  }

  get relayNodeMultiaddr (): Multiaddr {
    return this._relayNodeMultiaddr;
  }

  get metrics (): PrometheusMetrics {
    return this._metrics;
  }

  async getPeerInfo (): Promise<DebugPeerInfo> {
    assert(this.node);
    assert(this.peerId);

    const selfInfo: SelfInfo = {
      peerId: this.peerId.toString(),
      primaryRelayNode: this.relayNodeMultiaddr.toString(),
      multiaddrs: this.node.getMultiaddrs().map(multiaddr => multiaddr.toString())
    };

    const connInfo: ConnectionInfo[] = this.node.getConnections().map(connection => {
      return {
        id: connection.id,
        peerId: connection.remotePeer.toString(),
        multiaddr: connection.remoteAddr.toString(),
        direction: connection.stat.direction,
        status: connection.stat.status,
        type: connection.remoteAddr.toString().includes('p2p-circuit/p2p') ? 'relayed' : 'direct',
        nodeType: this.isRelayPeerMultiaddr(connection.remoteAddr.toString())
          ? this.isPrimaryRelay(connection.remoteAddr.toString()) ? 'Relay (Primary)' : 'Relay (Secondary)'
          : 'Peer',
        latency: this.getLatencyData(connection.remotePeer)
      };
    });

    const metrics = await this.metrics.getMetricsAsMap();

    return {
      selfInfo,
      connInfo,
      metrics
    };
  }

  async init (initOptions: PeerInitConfig, peerIdObj?: PeerIdObj): Promise<void> {
    this._relayRedialInterval = initOptions.relayRedialInterval;
    this._maxRelayConnections = initOptions.maxRelayConnections;
    const pingTimeout = initOptions.pingTimeout ?? DEFAULT_PING_TIMEOUT;

    try {
      let peerId: PeerId | undefined;
      if (peerIdObj) {
        peerId = await createFromJSON(peerIdObj);
      }

      this._node = await createLibp2p({
        peerId,
        addresses: {
          // Use existing protocol id in multiaddr to listen through signalling channel to relay node
          // Allows direct webrtc connection to a peer if possible (eg. peers on a same network)
          listen: [`${this._relayNodeMultiaddr.toString()}/${P2P_WEBRTC_STAR_ID}`]
        },
        transports: [this._wrtcTransport],
        connectionEncryption: [noise()],
        streamMuxers: [mplex()],
        pubsub: floodsub({ globalSignaturePolicy: PUBSUB_SIGNATURE_POLICY }),
        peerDiscovery: [
          // Use pubsub based discovery; relay server acts as a peer discovery source
          pubsubPeerDiscovery({
            interval: PUBSUB_DISCOVERY_INTERVAL
          })
        ],
        relay: {
          enabled: true,
          autoRelay: {
            enabled: true,
            maxListeners: 2
          }
        },
        connectionManager: {
          maxDialsPerPeer: MAX_CONCURRENT_DIALS_PER_PEER,
          autoDial: false,
          maxConnections: initOptions.maxConnections ?? MAX_CONNECTIONS,
          minConnections: initOptions.minConnections ?? MIN_CONNECTIONS,
          dialTimeout: initOptions.dialTimeout ?? DIAL_TIMEOUT,
          keepMultipleConnections: true // Set true to get connections with multiple multiaddr
        },
        ping: {
          timeout: pingTimeout
        },
        metrics: () => this._metrics
      });
    } catch (err: any) {
      console.log('Could not initialize a libp2p node', err);
      return;
    }

    console.log('libp2p node created', this._node);
    this._peerHeartbeatChecker = new PeerHearbeatChecker(
      this._node,
      {
        pingInterval: initOptions.pingInterval,
        pingTimeout
      }
    );

    // Dial to the HOP enabled primary relay node
    await this._dialRelay(this._relayRedialInterval);

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

    // Listen for change in peer protocols
    this._node.peerStore.addEventListener('change:protocols', async (evt) => {
      assert(this._node);
      console.log('event change:protocols', evt);
      await this._handleChangeProtocols(evt.detail);
    });

    // Listen for peers discovery
    this._node.addEventListener('peer:discovery', (evt) => {
      // console.log('event peer:discovery', evt);
      this._handleDiscovery(evt.detail, this._maxRelayConnections);
    });

    // Listen for peers connection
    this._node.addEventListener('peer:connect', async (evt) => {
      console.log('event peer:connect', evt);
      await this._handleConnect(evt.detail, this._maxRelayConnections);
    });

    // Listen for peers disconnecting
    // peer:disconnect event is trigerred when all connections to a peer close
    // https://github.com/libp2p/js-libp2p-interfaces/blob/master/packages/interface-libp2p/src/index.ts#L64
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
      this._handlePubSubMessage(evt.detail);
    });
  }

  async close (): Promise<void> {
    assert(this._node);

    this._node.peerStore.removeEventListener('change:multiaddrs');
    this._node.removeEventListener('peer:discovery');
    this._node.removeEventListener('peer:connect');
    this._node.removeEventListener('peer:disconnect');
    this._node.peerStore.removeEventListener('change:multiaddrs');
    this._node.peerStore.removeEventListener('change:protocols');
    this._node.pubsub.removeEventListener('message');

    await this._node.unhandle(CHAT_PROTOCOL);
    const remotePeerIds = this._node.getPeers();
    remotePeerIds.forEach(remotePeerId => this._peerHeartbeatChecker?.stop(remotePeerId));
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

  async requestPeerInfo (): Promise<void> {
    assert(this._node);

    const request: DebugRequest = { type: 'Request' };
    await this._node.pubsub.publish(DEBUG_INFO_TOPIC, uint8ArrayFromString(JSON.stringify(request)));
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

  subscribeDebugInfo (handler: (peerId: PeerId, data: any) => void): void {
    this.subscribeTopic(DEBUG_INFO_TOPIC, this._debugInfoRequestHandler.bind(this));
    this.subscribeTopic(DEBUG_INFO_TOPIC, handler);
  }

  isRelayPeerMultiaddr (multiaddrString: string): boolean {
    // Multiaddr not having p2p-circuit id or webrtc-star id is of a relay node
    return !(multiaddrString.includes(P2P_CIRCUIT_ID) || multiaddrString.includes(P2P_WEBRTC_STAR_ID));
  }

  isPrimaryRelay (multiaddrString: string): boolean {
    return multiaddrString === this._relayNodeMultiaddr.toString();
  }

  getLatencyData (peerId: PeerId): Array<number> {
    if (this._peerHeartbeatChecker) {
      return this._peerHeartbeatChecker.getLatencyData(peerId);
    }

    return [];
  }

  async _handleChangeProtocols ({ peerId, protocols }: { peerId: PeerId, protocols: string[] }) {
    assert(this._node);

    // Ignore self protocol changes
    if (peerId.equals(this._node.peerId)) {
      return;
    }

    // Ignore if chat protocol is not handled by remote peer
    if (!protocols.includes(CHAT_PROTOCOL)) {
      return;
    }

    // Handle protocol and open stream from only one side
    if (this._node.peerId.toString() > peerId.toString()) {
      return;
    }

    const [connection] = this._node.getConnections(peerId);

    // Open stream if connection exists and it doesn't already have a stream with chat protocol
    if (connection && !connection.streams.some(stream => stream.stat.protocol === CHAT_PROTOCOL)) {
      await this._createProtocolStream(connection, CHAT_PROTOCOL);
    }
  }

  async _dialRelay (redialInterval = RELAY_REDIAL_INTERVAL): Promise<void> {
    assert(this._node);
    const relayMultiaddr = this._relayNodeMultiaddr;
    console.log('Dialling primary relay node');

    const connection = await dialWithRetry(
      this._node,
      relayMultiaddr,
      {
        redialInterval: redialInterval,
        maxRetry: Infinity
      }
    );

    const relayPeerId = connection.remotePeer;

    // Tag the relay node with a high value to prioritize it's connection
    // in connection pruning on crossing peer's maxConnections limit
    this._node.peerStore.tagPeer(relayPeerId, RELAY_TAG.tag, { value: RELAY_TAG.value }).catch((err: Error) => {
      // TODO: Check if tag already exists
      // If awaited on the getTags / tagPeer method, relay node connect event is not triggered
      // const peerTags = await this._node.peerStore.getTags(relayPeerId);

      // Ignore the error thrown on retagging a peer on reconnect
      if (err.message === ERR_PEER_ALREADY_TAGGED) {
        return;
      }

      throw err;
    });
  }

  _handleDiscovery (peer: PeerInfo, maxRelayConnections = DEFAULT_MAX_RELAY_CONNECTIONS): void {
    // Check connected peers as they are discovered repeatedly.
    if (this._node?.getPeers().some(remotePeerId => remotePeerId.toString() === peer.id.toString())) {
      return;
    }

    let isRelayPeer = false;
    for (const multiaddr of peer.multiaddrs) {
      if (this.isRelayPeerMultiaddr(multiaddr.toString())) {
        isRelayPeer = true;
        break;
      }
    }

    // Check relay connections limit if it's a relay peer
    if (isRelayPeer && this._numRelayConnections >= maxRelayConnections) {
      // console.log(`Ignoring discovered relay node ${peer.id.toString()} as max relay connections limit reached`);
      return;
    }

    console.log(`Discovered peer ${peer.id.toString()} with multiaddrs`, peer.multiaddrs.map(addr => addr.toString()));
    this._connectPeer(peer);
  }

  async _handleConnect (connection: Connection, maxRelayConnections = DEFAULT_MAX_RELAY_CONNECTIONS): Promise<void> {
    assert(this._node);
    const remotePeerId = connection.remotePeer;
    const remotePeerIdString = connection.remotePeer.toString();
    const remoteAddrString = connection.remoteAddr.toString();

    // Log connected peer
    console.log(`Connected to ${remotePeerIdString} using multiaddr ${remoteAddrString}`);

    const isRemoteARelayPeer = this.isRelayPeerMultiaddr(remoteAddrString);

    if (isRemoteARelayPeer) {
      this._numRelayConnections++;

      // Check if relay connections limit has already been reached
      if (this._numRelayConnections > maxRelayConnections && !this.isPrimaryRelay(remoteAddrString)) {
        console.log(`Closing connection to relay ${remotePeerIdString} as max relay connections limit reached`);
        await connection.close();
        return;
      }
    }

    // Manage connections and streams
    // Check if peer id is smaller to break symmetry in case of peer nodes
    if (isRemoteARelayPeer || this._node.peerId.toString() < remotePeerIdString) {
      const remoteConnections = this._node.getConnections(remotePeerId);

      // Keep only one connection with a peer
      if (remoteConnections.length > 1) {
        // Close new connection if using relayed multiaddr
        if (connection.remoteAddr.protoNames().includes(P2P_CIRCUIT_ID)) {
          console.log(`Closing new relayed connection with ${remotePeerIdString} in favor of existing connection`);
          await connection.close();
          console.log('Closed');

          return;
        }

        console.log(`Closing exisiting connections with ${remotePeerIdString} in favor of new webrtc connection`);
        // Close existing connections if new connection is not using relayed multiaddr (so it is a webrtc connection)
        const closeConnectionPromises = remoteConnections.filter(remoteConnection => remoteConnection.id !== connection.id)
          .map(remoteConnection => remoteConnection.close());

        await Promise.all(closeConnectionPromises);
        console.log('Closed');
      }

      // Open stream in new connection for chat protocol (if handled by remote peer)
      const protocols = await this._node.peerStore.protoBook.get(remotePeerId);

      // The chat protocol may not be updated in the list and will be handled later on change:protocols event
      if (protocols.includes(CHAT_PROTOCOL)) {
        await this._createProtocolStream(connection, CHAT_PROTOCOL);
      }
    }

    console.log(`Current number of peers connected: ${this._node.getPeers().length}`);

    // Start heartbeat check for peer
    await this._peerHeartbeatChecker?.start(
      remotePeerId,
      async () => this._handleDeadConnections(remotePeerId)
    );
  }

  async _createProtocolStream (connection: Connection, protocol: string) {
    assert(this._node);
    const remotePeerId = connection.remotePeer;

    try {
      const stream = await connection.newStream([protocol]);
      this._handleStream(remotePeerId, stream);
    } catch (err: any) {
      console.log(`Could not create a new ${protocol} stream with ${remotePeerId.toString()}`, err);
    }
  }

  async _handleDeadConnections (remotePeerId: PeerId) {
    // Close existing connections of remote peer
    console.log(`Closing connections for ${remotePeerId}`);
    await this._node?.hangUp(remotePeerId);
    console.log('Closed');
  }

  async _handleDisconnect (connection: Connection): Promise<void> {
    assert(this._node);
    const disconnectedPeerId = connection.remotePeer;
    const remoteAddrString = connection.remoteAddr.toString();

    // Log disconnected peer
    console.log(`Disconnected from ${disconnectedPeerId.toString()} using multiaddr ${remoteAddrString}`);
    console.log(`Current number of peers connected: ${this._node?.getPeers().length}`);

    if (this.isRelayPeerMultiaddr(remoteAddrString)) {
      this._numRelayConnections--;
    }

    // Stop connection check for disconnected peer
    this._peerHeartbeatChecker?.stop(disconnectedPeerId);

    if (disconnectedPeerId.toString() === this._relayNodeMultiaddr?.getPeerId()) {
      // Reconnect to primary relay node if disconnected
      await this._dialRelay(this._relayRedialInterval);
    }
  }

  async _connectPeer (peer: PeerInfo): Promise<void> {
    assert(this._node);

    // Dial them when we discover them
    const peerIdString = peer.id.toString();

    try {
      console.log(`Dialling peer ${peerIdString}`);
      // When dialling with peer id, all multiaddr(s) (direct/relayed) of the discovered peer are dialled in parallel
      await this._node.dial(peer.id);
    } catch (err: any) {
      console.log(`Could not dial ${peerIdString}`, err);
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

  _handlePubSubMessage (msg: Message): void {
    // Messages should be signed since globalSignaturePolicy is set to 'StrictSign'
    assert(msg.type === 'signed');

    // Send msg data to registered topic handlers
    this._topicHandlers.get(msg.topic)?.forEach(handler => {
      const dataObj = JSON.parse(uint8ArrayToString(msg.data));
      handler(msg.from, dataObj);
    });
  }

  async _debugInfoRequestHandler (peerId: PeerId, msg: any): Promise<void> {
    const debugMsg = msg as DebugMsg;
    const msgType = debugMsg.type;

    if (msgType === 'Request') {
      const peerInfo = await this.getPeerInfo();
      const response: DebugResponse = {
        type: 'Response',
        dst: peerId.toString(),
        peerInfo
      };

      await this.floodMessage(DEBUG_INFO_TOPIC, response);
    }
  }
}

export async function createPeerId (): Promise<PeerIdObj> {
  const peerId = await createEd25519PeerId();
  assert(peerId.privateKey);

  return {
    id: peerId.toString(),
    privKey: Buffer.from(peerId.privateKey).toString('base64'),
    pubKey: Buffer.from(peerId.publicKey).toString('base64')
  };
}
