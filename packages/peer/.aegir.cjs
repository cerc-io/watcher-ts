'use strict'

// const wrtc = require('wrtc')

// TODO: Temporary fix per wrtc issue
// https://github.com/node-webrtc/node-webrtc/issues/636#issuecomment-774171409
// process.on('beforeExit', (code) => process.exit(code))

async function before () {
  const { createRelayNode } = await import('./dist/src/relay.js')
  const { createFromJSON } = await import('@libp2p/peer-id-factory')

  // const { relayPeerIdJson } = await import('./dist/test/relay-peer-id.json', {
  //   assert: { type: 'json' }
  // })
  const { RELAY_PORT } = await import('./dist/test/constants.js')

  const relayPeerIdJson = {
    "id": "12D3KooWRxmi5GXThHcLzadFGS7KWwMmYMsVpMjZpbgV6QQ1Cd68",
    "privKey": "CAESQDCAhwGVSQMYLysaTO+XAg31aig68n5A8aNdvhehjhCL7+JBFphTnaTND+6XSlP621nktg/i43ajZi9T23vmQZE=",
    "pubKey": "CAESIO/iQRaYU52kzQ/ul0pT+ttZ5LYP4uN2o2YvU9t75kGR"
  }
  const RELAY_PEER_ID = await createFromJSON(relayPeerIdJson);

  console.log('RELAY_PEER_ID', RELAY_PEER_ID)
  console.log('RELAY_PORT', RELAY_PORT)

  await createRelayNode(RELAY_PORT, [], RELAY_PEER_ID);
}

/** @type {import('aegir').PartialOptions} */
module.exports = {
  test: {
    build: false,
    target: ['browser'],
    runner: 'browser',
    // runner: 'node',
    files: ['dist/**/*.test.js'],
    // browser: {
    //   config: {
    //     browser: 'chromium'
    //   }
    // },
    before
  }
}
