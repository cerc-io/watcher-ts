//
// Copyright 2022 Vulcanize, Inc.
//

import { createLibp2p, Libp2p } from 'libp2p';
// For nodejs.
// import wrtc from 'wrtc';
import assert from 'assert';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import map from 'it-map';
import { pushable, Pushable } from 'it-pushable';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';

import { webSockets } from '@libp2p/websockets';
import { webRTCStar, WebRTCStarTuple } from '@libp2p/webrtc-star';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import type { Stream as P2PStream, Connection } from '@libp2p/interface-connection';
import type { PeerInfo } from '@libp2p/interface-peer-info';
import { PeerId } from '@libp2p/interface-peer-id';

const PROTOCOL = '/chat/1.0.0';
const DEFAULT_SIGNAL_SERVER_URL = '/ip4/127.0.0.1/tcp/13579/wss/p2p-webrtc-star';

export class Peer {
  _node?: Libp2p
  _wrtcStar: WebRTCStarTuple

  _remotePeerIds: PeerId[] = []
  _peerStreamMap: Map<string, Pushable<string>> = new Map()
  _messageHandlers: Array<(peerId: PeerId, message: string) => void> = []

  constructor () {
    // Instantiation in nodejs.
    // this._wrtcStar = webRTCStar({ wrtc });
    this._wrtcStar = webRTCStar();
  }

  get peerId (): PeerId | undefined {
    return this._node?.peerId;
  }

  async init (signalServerURL = DEFAULT_SIGNAL_SERVER_URL): Promise<void> {
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
      peerDiscovery: [
        this._wrtcStar.discovery
      ]
    });

    // Listen for peers discovery
    this._node.addEventListener('peer:discovery', (evt) => {
      this._handleDiscovery(evt.detail);
    });

    // Listen for peers connection
    this._node.connectionManager.addEventListener('peer:connect', (evt) => {
      this._handleConnect(evt.detail);
    });

    // Listen for peers disconnecting
    this._node.connectionManager.addEventListener('peer:disconnect', (evt) => {
      this._handleDisconnect(evt.detail);
    });

    // Handle messages for the protocol
    await this._node.handle(PROTOCOL, async ({ stream, connection }) => {
      this._handleStream(connection.remotePeer, stream);
    });
  }

  broadcastMessage (message: string): void {
    for (const [, stream] of this._peerStreamMap) {
      stream.push(message);
    }
  }

  subscribeMessage (handler: (peerId: PeerId, message: string) => void) : () => void {
    this._messageHandlers.push(handler);

    const unsubscribe = () => {
      this._messageHandlers = this._messageHandlers
        .filter(registeredHandler => registeredHandler !== handler);
    };

    return unsubscribe;
  }

  _handleDiscovery (peer: PeerInfo): void {
    // Check connected peers as they are discovered repeatedly.
    if (!this._remotePeerIds.some(remotePeerId => remotePeerId.toString() === peer.id.toString())) {
      this._connectPeer(peer);
    }
  }

  _handleConnect (connection: Connection): void {
    const remotePeerId = connection.remotePeer;
    this._remotePeerIds.push(remotePeerId);

    // Log connected peer
    console.log('Connected to %s', remotePeerId.toString());
  }

  _handleDisconnect (connection: Connection): void {
    const disconnectedPeerId = connection.remotePeer;
    this._remotePeerIds = this._remotePeerIds.filter(remotePeerId => remotePeerId.toString() !== disconnectedPeerId.toString());

    // Log disconnected peer
    console.log(`Disconnected from ${disconnectedPeerId.toString()}`);
  }

  async _connectPeer (peer: PeerInfo): Promise<void> {
    assert(this._node);
    console.log(`Found peer ${peer.id.toString()}`);

    // Dial them when we discover them
    const stream = await this._node.dialProtocol(peer.id, PROTOCOL);

    this._handleStream(peer.id, stream);
  }

  _handleStream (peerId: PeerId, stream: P2PStream): void {
    const messageStream = pushable<string>({ objectMode: true });

    // Send message to pipe from stdin
    pipe(
      // Read from stream (the source)
      messageStream,
      // Turn strings into buffers
      (source) => map(source, (string) => uint8ArrayFromString(string)),
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
      // Turn buffers into strings
      (source) => map(source, (buf) => uint8ArrayToString(buf.subarray())),
      // Sink function
      async (source) => {
        // For each chunk of data
        for await (const msg of source) {
          this._messageHandlers.forEach(messageHandler => messageHandler(peerId, msg.toString()));
        }
      }
    );

    this._peerStreamMap.set(peerId.toString(), messageStream);
  }
}
