//
// Copyright 2023 Vulcanize, Inc.
//

import assert from 'assert';
import { Buffer } from 'buffer';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import map from 'it-map';
import { pushable, Pushable } from 'it-pushable';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';
import debug from 'debug';

import { createLibp2p, Libp2p, Libp2pInit } from '@cerc-io/libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import type { Stream as P2PStream, Connection } from '@libp2p/interface-connection';
import type { PeerInfo } from '@libp2p/interface-peer-info';
import type { Message } from '@libp2p/interface-pubsub';
import type { PeerId } from '@libp2p/interface-peer-id';
import { createFromJSON, createEd25519PeerId } from '@libp2p/peer-id-factory';
import { multiaddr, Multiaddr } from '@multiformats/multiaddr';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
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
  DEBUG_INFO_TOPIC,
  P2P_WEBRTC_STAR_ID
} from './constants.js';
import { PeerHearbeatChecker } from './peer-heartbeat-checker.js';
import { debugInfoRequestHandler, dialWithRetry, getConnectionsInfo, getPseudonymForPeerId, getSelfInfo, isMultiaddrBlacklisted, wsPeerFilter } from './utils/index.js';
import { ConnectionType, DebugPeerInfo, DebugRequest, PeerConnectionInfo, PeerSelfInfo } from './types/debug-info.js';

const log = debug('laconic:peer');

const ERR_PEER_ALREADY_TAGGED = 'Peer already tagged';
const ERR_DEBUG_INFO_NOT_ENABLED = 'Debug info not enabled';

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
  denyMultiaddrs?: string[];
  maxConnections?: number;
  minConnections?: number;
  dialTimeout?: number;
  enableDebugInfo?: boolean;
  transports?: Libp2pInit['transports'];
  listenMultiaddrs?: string[];
  peerDiscovery?: Libp2pInit['peerDiscovery'];
}

export class Peer {
  _node?: Libp2p;
  _peerHeartbeatChecker?: PeerHearbeatChecker;
  _webRTCSignallingEnabled: boolean;

  _relayNodeMultiaddr: Multiaddr;
  _numRelayConnections = 0;

  _relayRedialInterval?: number;
  _maxRelayConnections?: number;
  _denyMultiaddrs?: string[];

  _debugInfoEnabled?: boolean;

  _peerStreamMap: Map<string, Pushable<any>> = new Map();
  _messageHandlers: Array<(peerId: PeerId, message: any) => void> = [];
  _topicHandlers: Map<string, Array<(peerId: PeerId, data: any) => void>> = new Map();
  _metrics = new PrometheusMetrics();

  constructor (relayNodeURL: string, nodejs?: boolean) {
    this._webRTCSignallingEnabled = !(nodejs === true);
    this._relayNodeMultiaddr = multiaddr(relayNodeURL);

    const relayPeerId = this._relayNodeMultiaddr.getPeerId();
    assert(relayPeerId);

    log(`Using peer ${relayPeerId} (${getPseudonymForPeerId(relayPeerId)}) as the primary relay node`);
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

  async init (initOptions: PeerInitConfig, peerIdObj?: PeerIdObj): Promise<void> {
    this._relayRedialInterval = initOptions.relayRedialInterval;
    this._denyMultiaddrs = initOptions.denyMultiaddrs;
    this._maxRelayConnections = initOptions.maxRelayConnections;
    this._debugInfoEnabled = initOptions.enableDebugInfo;
    const pingTimeout = initOptions.pingTimeout ?? DEFAULT_PING_TIMEOUT;

    try {
      let peerId: PeerId | undefined;
      if (peerIdObj) {
        peerId = await createFromJSON(peerIdObj);
      }

      let webRTCSignal = {};
      if (this._webRTCSignallingEnabled) {
        const relayPeerIdString = this._relayNodeMultiaddr.getPeerId();
        assert(relayPeerIdString);

        webRTCSignal = {
          enabled: true,
          isSignallingNode: false,
          autoSignal: {
            enabled: true,
            relayPeerId: relayPeerIdString
          }
        };
      }

      this._node = await createLibp2p({
        peerId,
        transports: [
          webSockets({
            filter: wsPeerFilter
          }),
          ...(initOptions.transports ?? [])
        ],
        addresses: {
          listen: initOptions.listenMultiaddrs ?? []
        },
        connectionEncryption: [noise()],
        streamMuxers: [mplex()],
        pubsub: gossipsub({
          globalSignaturePolicy: PUBSUB_SIGNATURE_POLICY,
          allowPublishToZeroPeers: true
        }),
        peerDiscovery: [
          // Use pubsub based discovery; relay server acts as a peer discovery source
          pubsubPeerDiscovery({
            interval: PUBSUB_DISCOVERY_INTERVAL
          }),
          ...(initOptions.peerDiscovery ?? [])
        ],
        relay: {
          enabled: true,
          autoRelay: {
            enabled: true,
            maxListeners: 2
          }
        },
        webRTCSignal,
        connectionManager: {
          maxDialsPerPeer: MAX_CONCURRENT_DIALS_PER_PEER,
          autoDial: false,
          deny: initOptions.denyMultiaddrs,
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
      log('Could not initialize a libp2p node', err);
      return;
    }

    log('libp2p node created', this._node);
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
        log('Updated self multiaddrs', this._node.getMultiaddrs().map(addr => addr.toString()));
      } else {
        log('Updated peer node multiaddrs', multiaddrs.map((addr: Multiaddr) => addr.toString()));
      }
    });

    // Listen for change in peer protocols
    this._node.peerStore.addEventListener('change:protocols', async (evt) => {
      assert(this._node);
      log('event change:protocols', evt);
      await this._handleChangeProtocols(evt.detail);
    });

    // Listen for peers discovery
    this._node.addEventListener('peer:discovery', (evt) => {
      // log('event peer:discovery', evt);
      this._handleDiscovery(evt.detail, this._maxRelayConnections);
    });

    // Listen for peers connection
    this._node.addEventListener('peer:connect', async (evt) => {
      // log('event peer:connect', evt);
      await this._handleConnect(evt.detail, this._maxRelayConnections);
    });

    // Listen for peers disconnecting
    // peer:disconnect event is trigerred when all connections to a peer close
    // https://github.com/libp2p/js-libp2p-interfaces/blob/master/packages/interface-libp2p/src/index.ts#L64
    this._node.addEventListener('peer:disconnect', (evt) => {
      // log('event peer:disconnect', evt);
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

    if (this._debugInfoEnabled) {
      log('Debug info enabled');
      this._registerDebugInfoRequestHandler();
    }
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

  async getInfo (): Promise<DebugPeerInfo> {
    assert(this.node);
    assert(this.peerId);

    const selfInfo: PeerSelfInfo = this.getPeerSelfInfo();
    const connInfo: PeerConnectionInfo[] = this.getPeerConnectionsInfo();
    const metrics = await this.metrics.getMetricsAsMap();

    return {
      selfInfo,
      connInfo,
      metrics
    };
  }

  getPeerSelfInfo (): PeerSelfInfo {
    assert(this._node);

    const selfInfo = getSelfInfo(this._node);

    return {
      ...selfInfo,
      primaryRelayMultiaddr: this.relayNodeMultiaddr.toString(),
      primaryRelayPeerId: this.relayNodeMultiaddr.getPeerId()
    };
  }

  getPeerConnectionsInfo (): PeerConnectionInfo[] {
    assert(this._node);
    assert(this._peerHeartbeatChecker);
    const connectionsInfo = getConnectionsInfo(this._node, this._peerHeartbeatChecker);

    return connectionsInfo.map(connectionInfo => {
      const peerConnectionInfo: PeerConnectionInfo = {
        ...connectionInfo,
        isPeerRelay: this.isRelayPeerMultiaddr(connectionInfo.multiaddr),
        isPeerRelayPrimary: this.isPrimaryRelay(connectionInfo.multiaddr)
      };

      if (peerConnectionInfo.type === ConnectionType.Relayed) {
        peerConnectionInfo.hopRelayPeerId = multiaddr(peerConnectionInfo.multiaddr).decapsulate('p2p-circuit/p2p').getPeerId();
      }

      return peerConnectionInfo;
    });
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

    if (!this._debugInfoEnabled) {
      throw new Error(ERR_DEBUG_INFO_NOT_ENABLED);
    }

    const request: DebugRequest = { type: 'Request' };
    await this.floodMessage(DEBUG_INFO_TOPIC, request);
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

  subscribeDebugInfo (handler: (peerId: PeerId, data: any) => void): () => void {
    if (!this._debugInfoEnabled) {
      throw new Error(ERR_DEBUG_INFO_NOT_ENABLED);
    }

    return this.subscribeTopic(DEBUG_INFO_TOPIC, handler);
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
    log('Dialling primary relay node');

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
      if (isMultiaddrBlacklisted(this._denyMultiaddrs ?? [], multiaddr)) {
        log(`Ignoring blacklisted node with multiaddr ${multiaddr.toString()}`);
        return;
      }

      if (this.isRelayPeerMultiaddr(multiaddr.toString())) {
        isRelayPeer = true;
        break;
      }
    }

    // Check relay connections limit if it's a relay peer
    if (isRelayPeer && this._numRelayConnections >= maxRelayConnections) {
      // log(`Ignoring discovered relay node ${peer.id.toString()} as max relay connections limit reached`);
      return;
    }

    log(`Discovered peer ${peer.id.toString()} (${getPseudonymForPeerId(peer.id.toString())}) with multiaddrs`, peer.multiaddrs.map(addr => addr.toString()));
    this._connectPeer(peer);
  }

  async _handleConnect (connection: Connection, maxRelayConnections = DEFAULT_MAX_RELAY_CONNECTIONS): Promise<void> {
    assert(this._node);
    const remotePeerId = connection.remotePeer;
    const remotePeerIdString = connection.remotePeer.toString();
    const remoteAddrString = connection.remoteAddr.toString();

    // Log connected peer
    log(`Connected to ${remotePeerIdString} (${getPseudonymForPeerId(remotePeerIdString)}) using multiaddr ${remoteAddrString}`);

    const isRemoteARelayPeer = this.isRelayPeerMultiaddr(remoteAddrString);

    if (isRemoteARelayPeer) {
      this._numRelayConnections++;

      // Check if relay connections limit has already been reached
      if (this._numRelayConnections > maxRelayConnections && !this.isPrimaryRelay(remoteAddrString)) {
        log(`Closing connection to relay ${remotePeerIdString} (${getPseudonymForPeerId(remotePeerIdString)}) as max relay connections limit reached`);
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
          log(`Closing new relayed connection with ${remotePeerIdString} (${getPseudonymForPeerId(remotePeerIdString)}) in favor of existing connection`);
          await connection.close();
          log('Closed');

          return;
        }

        log(`Closing exisiting connections with ${remotePeerIdString} (${getPseudonymForPeerId(remotePeerIdString)}) in favor of new webrtc connection`);
        // Close existing connections if new connection is not using relayed multiaddr (so it is a webrtc connection)
        const closeConnectionPromises = remoteConnections.filter(remoteConnection => remoteConnection.id !== connection.id)
          .map(remoteConnection => remoteConnection.close());

        await Promise.all(closeConnectionPromises);
        log('Closed');
      }

      // Open stream in new connection for chat protocol (if handled by remote peer)
      const protocols = await this._node.peerStore.protoBook.get(remotePeerId);

      // The chat protocol may not be updated in the list and will be handled later on change:protocols event
      if (protocols.includes(CHAT_PROTOCOL)) {
        await this._createProtocolStream(connection, CHAT_PROTOCOL);
      }
    }

    log(`Current number of peers connected: ${this._node.getPeers().length}`);

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
      log(`Could not create a new ${protocol} stream with ${remotePeerId.toString()} (${getPseudonymForPeerId(remotePeerId.toString())})`, err);
    }
  }

  async _handleDeadConnections (remotePeerId: PeerId) {
    // Close existing connections of remote peer
    log(`Closing connections for ${remotePeerId} (${getPseudonymForPeerId(remotePeerId.toString())})`);
    await this._node?.hangUp(remotePeerId);
    log('Closed');
  }

  async _handleDisconnect (connection: Connection): Promise<void> {
    assert(this._node);
    const disconnectedPeerId = connection.remotePeer;
    const remoteAddrString = connection.remoteAddr.toString();

    // Log disconnected peer
    log(`Disconnected from ${disconnectedPeerId.toString()} (${getPseudonymForPeerId(disconnectedPeerId.toString())}) using multiaddr ${remoteAddrString}`);
    log(`Current number of peers connected: ${this._node?.getPeers().length}`);

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
      log(`Dialling peer ${peerIdString} (${getPseudonymForPeerId(peerIdString)})`);
      // When dialling with peer id, all multiaddr(s) (direct/relayed) of the discovered peer are dialled in parallel
      await this._node.dial(peer.id);
    } catch (err: any) {
      log(`Could not dial ${peerIdString} (${getPseudonymForPeerId(peerIdString)})`, err);
    }
  }

  _handleStream (peerId: PeerId, stream: P2PStream): void {
    // log('Stream after connection', stream);
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

  _registerDebugInfoRequestHandler (): void {
    this.subscribeTopic(DEBUG_INFO_TOPIC, async (peerId: PeerId, msg: any): Promise<void> => {
      assert(this._node);

      await debugInfoRequestHandler({
        node: this._node,
        getPeerInfo: this.getInfo.bind(this),
        peerId,
        msg
      });
    });
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
