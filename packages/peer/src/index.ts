//
// Copyright 2022 Vulcanize, Inc.
//

import { createLibp2p, Libp2p } from 'libp2p'
// For nodejs.
import wrtc from 'wrtc'

import { webSockets } from '@libp2p/websockets'
import { webRTCStar, WebRTCStarTuple } from '@libp2p/webrtc-star'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { bootstrap } from '@libp2p/bootstrap'

// Known peers addresses
const bootstrapMultiaddrs = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN'
]

export class Peer {
  _node?: Libp2p
  _wrtcStar: WebRTCStarTuple

  constructor () {
    // Instantiation in nodejs.
    this._wrtcStar = webRTCStar({ wrtc });
  }

  async init () {
    this._node = await createLibp2p({
      addresses: {
        // Add the signaling server address, along with our PeerId to our multiaddrs list
        // libp2p will automatically attempt to dial to the signaling server so that it can
        // receive inbound connections from other peers
        listen: [
          '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
          '/dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star'
        ]
      },
      transports: [
        webSockets(),
        this._wrtcStar.transport
      ],
      connectionEncryption: [noise()],
      streamMuxers: [mplex()],
      peerDiscovery: [
        this._wrtcStar.discovery,
        bootstrap({
          list: bootstrapMultiaddrs, // provide array of multiaddrs
        })
      ],
    })

    this._node.addEventListener('peer:discovery', (evt) => {
      console.log('Discovered %s', evt.detail.id.toString()) // Log discovered peer
    })
    
    this._node.connectionManager.addEventListener('peer:connect', (evt) => {
      console.log('Connected to %s', evt.detail.remotePeer.toString()) // Log connected peer
    })

    // Listen for peers disconnecting
    this._node.connectionManager.addEventListener('peer:disconnect', (evt) => {
      const connection = evt.detail
      console.log(`Disconnected from ${connection.remotePeer.toString()}`)
    })

    console.log(`libp2p id is ${this._node.peerId.toString()}`)
  }
}

const peer = new Peer();

peer.init()
  .then(() => console.log("started"))
