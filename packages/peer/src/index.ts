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

import type { Stream as P2PStream, Connection } from '@libp2p/interface-connection';
import type { PeerInfo } from '@libp2p/interface-peer-info';
import type { PeerId } from '@libp2p/interface-peer-id';
import { webRTCStar, WebRTCStarTuple } from '@libp2p/webrtc-star';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { multiaddr, Multiaddr } from '@multiformats/multiaddr';
import { bootstrap } from '@libp2p/bootstrap';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';

export const PROTOCOL = '/chat/1.0.0';
export const DEFAULT_SIGNAL_SERVER_URL = '/ip4/127.0.0.1/tcp/13579/wss/p2p-webrtc-star';

export class Peer {
  _node?: Libp2p
  _wrtcStar: WebRTCStarTuple
  _relayNodeMultiaddr?: Multiaddr

  _remotePeerIds: PeerId[] = []
  _peerStreamMap: Map<string, Pushable<string>> = new Map()
  _messageHandlers: Array<(peerId: PeerId, message: string) => void> = []

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

  async init (signalServerURL = DEFAULT_SIGNAL_SERVER_URL, relayNodeURL?: string): Promise<void> {
    let peerDiscovery: any;
    if (relayNodeURL) {
      console.log('Bootstrapping relay node');
      this._relayNodeMultiaddr = multiaddr(relayNodeURL);

      peerDiscovery = [
        bootstrap({
          list: [this._relayNodeMultiaddr.toString()]
        }),
        // Add pubsub discovery; relay server acts as a peer discovery source
        pubsubPeerDiscovery({
          interval: 1000
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
      pubsub: gossipsub({ allowPublishToZeroPeers: true }),
      peerDiscovery,
      relay: {
        enabled: true,
        autoRelay: {
          enabled: true,
          maxListeners: 2
        }
      },
      connectionManager: {
        autoDial: false,
        maxDialsPerPeer: 1
      }
    });

    console.log('libp2p node created', this._node);

    // Listen for change in stored multiaddrs
    this._node.peerStore.addEventListener('change:multiaddrs', (evt) => {
      assert(this._node);
      const { peerId, multiaddrs } = evt.detail;

      // Log updated self multiaddrs
      if (peerId.equals(this._node.peerId)) {
        console.log('Updated self multiaddrs', this._node.getMultiaddrs().map(addr => addr.toString()));
      } else {
        console.log('Updated other node\'s multiaddrs', multiaddrs.map((addr: Multiaddr) => addr.toString()));
      }
    });

    // Listen for peers discovery
    this._node.addEventListener('peer:discovery', (evt) => {
      console.log('event peer:discovery', evt);
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
    await this._node.handle(PROTOCOL, async ({ stream, connection }) => {
      this._handleStream(connection.remotePeer, stream);
    });
  }

  async close (): Promise<void> {
    assert(this._node);

    this._node.peerStore.removeEventListener('change:multiaddrs');
    this._node.removeEventListener('peer:discovery');
    this._node.connectionManager.removeEventListener('peer:connect');
    this._node.connectionManager.removeEventListener('peer:disconnect');

    await this._node.unhandle(PROTOCOL);
    const hangUpPromises = this._remotePeerIds.map(async peerId => this._node?.hangUp(peerId));
    await Promise.all(hangUpPromises);
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
    console.log('Discovered peer multiaddrs', peer.multiaddrs.map(addr => addr.toString()));

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
    const disconnectedPeerIdString = disconnectedPeerId.toString();

    this._remotePeerIds = this._remotePeerIds.filter(remotePeerId => remotePeerId.toString() !== disconnectedPeerIdString);
    this._endExistingStream(disconnectedPeerId);

    // Log disconnected peer
    console.log(`Disconnected from ${disconnectedPeerIdString}`);
  }

  async _connectPeer (peer: PeerInfo): Promise<void> {
    assert(this._node);
    console.log(`Dialling peer ${peer.id.toString()}`);

    // Check if discovered the relay node
    if (this._relayNodeMultiaddr) {
      const relayNodePeerId = this._relayNodeMultiaddr.getPeerId();
      if (relayNodePeerId && relayNodePeerId === peer.id.toString()) {
        await this._node.dial(this._relayNodeMultiaddr);
        return;
      }
    }

    // Dial them when we discover them
    // Attempt to dial all the multiaddrs of the discovered peer (to connect through relay)
    for (const peerMultiaddr of peer.multiaddrs) {
      const stream = await this._node.dialProtocol(peerMultiaddr, PROTOCOL).catch(err => {
        console.log(`Could not dial ${peerMultiaddr.toString()}`, err);
      });

      if (stream) {
        this._handleStream(peer.id, stream);
        break;
      }
    }
  }

  _handleStream (peerId: PeerId, stream: P2PStream): void {
    console.log('Stream after connection', stream);
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

    this._endExistingStream(peerId);

    this._peerStreamMap.set(peerId.toString(), messageStream);
  }

  // End an existing stream with the peer if exists
  _endExistingStream (peerId: PeerId): void {
    const existingPeerStream = this._peerStreamMap.get(peerId.toString());
    if (existingPeerStream) {
      console.log('ending existing stream');
      existingPeerStream.end();
    }
  }
}
