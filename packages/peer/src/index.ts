//
// Copyright 2022 Vulcanize, Inc.
//

import { createLibp2p, Libp2p } from 'libp2p'
// For nodejs.
import wrtc from 'wrtc'
import assert from 'assert'
import { pipe, Source } from 'it-pipe'
import * as lp from 'it-length-prefixed'
import map from 'it-map'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'

import { webSockets } from '@libp2p/websockets'
import { webRTCStar, WebRTCStarTuple } from '@libp2p/webrtc-star'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import type { Stream as P2PStream } from '@libp2p/interface-connection'
import type { PeerInfo } from '@libp2p/interface-peer-info'
import { PeerId } from '@libp2p/interface-peer-id'

const PROTOCOL = '/chat/1.0.0';
const DEFAULT_SIGNAL_SERVER_URL = '/ip4/127.0.0.1/tcp/13579/wss/p2p-webrtc-star';

export class Peer {
  _messageSource?: Source<string>
  _node?: Libp2p
  _wrtcStar: WebRTCStarTuple
  _remotePeerIds: PeerId[] = []

  constructor () {
    // Instantiation in nodejs.
    this._wrtcStar = webRTCStar({ wrtc });
  }

  async init (signalServerURL = DEFAULT_SIGNAL_SERVER_URL, messageSource: Source<string>) {
    this._messageSource = messageSource;
  
    this._node = await createLibp2p({
      addresses: {
        // Add the signaling server address, along with our PeerId to our multiaddrs list
        // libp2p will automatically attempt to dial to the signaling server so that it can
        // receive inbound connections from other peers
        listen: [
          // '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
          // '/dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star'
          signalServerURL
        ]
      },
      transports: [
        // webSockets(),
        this._wrtcStar.transport
      ],
      connectionEncryption: [noise()],
      streamMuxers: [mplex()],
      peerDiscovery: [
        this._wrtcStar.discovery,
        // bootstrap({
        //   list: bootstrapMultiaddrs, // provide array of multiaddrs
        // })
      ],
    })

    this._node.addEventListener('peer:discovery', (evt) => {
      const peer = evt.detail

      if (!this._remotePeerIds.some(remotePeerId => remotePeerId.toString() === peer.id.toString())) {
        this._connectPeer(peer)
      }
    })
    
    this._node.connectionManager.addEventListener('peer:connect', (evt) => {
      const remotePeerId = evt.detail.remotePeer;
      this._remotePeerIds.push(remotePeerId)
      console.log('Connected to %s', remotePeerId.toString()) // Log connected peer
    })

    // Listen for peers disconnecting
    this._node.connectionManager.addEventListener('peer:disconnect', (evt) => {
      const remotePeerId = evt.detail.remotePeer;
      this._remotePeerIds = this._remotePeerIds.filter(remotePeerId);
      console.log(`Disconnected from ${remotePeerId.toString()}`)
    })

    // Handle messages for the protocol
    await this._node.handle(PROTOCOL, async ({ stream, connection }) => {
      this._handleStream(connection.remotePeer, stream)
    })

    console.log(`libp2p id is ${this._node.peerId.toString()}`)
  }

  async _connectPeer (peer: PeerInfo) {
    assert(this._node)
    console.log(`Found peer ${peer.id.toString()}`)

    try {
      // dial them when we discover them
      const stream = await this._node.dialProtocol(peer.id, PROTOCOL)
  
      this._handleStream(peer.id, stream)
    } catch (err) {
      console.log("dial failed for peer.id", peer.id)
    }
  }

  _handleStream (peerId: PeerId, stream: P2PStream) {
    assert(this._messageSource)

    // Send message to pipe from stdin
    pipe(
      // Read from readable stream (the source)
      this._messageSource,
      // Turn strings into buffers
      (source) => map(source, (string) => uint8ArrayFromString(string)),
      // Encode with length prefix (so receiving side knows how much data is coming)
      lp.encode(),
      // Write to the stream (the sink)
      stream.sink
    )

    // log message from stream
    pipe(
      // Read from the stream (the source)
      // TODO: Implement read stream for browser
      stream.source,
      // Decode length-prefixed data
      lp.decode(),
      // Turn buffers into strings
      (source) => map(source, (buf) => uint8ArrayToString(buf.subarray())),
      // Sink function
      async function (source) {
        // For each chunk of data
        for await (const msg of source) {
          // Output the data as a utf8 string
          console.log(peerId.toString() + '> ' + msg.toString().replace('\n', ''))
        }
      }
    )
  }
}
