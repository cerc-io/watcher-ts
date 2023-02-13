import assert from 'assert';
import { isBrowser } from 'wherearewe';
import { createFromJSON } from '@libp2p/peer-id-factory';
import { multiaddr } from '@multiformats/multiaddr';

import { Peer } from './peer.js';
import { RELAY_LISTEN_ADDR } from '../test/constants.js';

import relayPeerIdJson from '../test/relay-peer-id.json' assert { type: 'json' };

describe('simple network setup', async () => {
  const RELAY_PEER_ID = await createFromJSON(relayPeerIdJson);
  const RELAY_MULTIADDR = multiaddr(`${RELAY_LISTEN_ADDR.toString()}/p2p/${RELAY_PEER_ID.toString()}`);

  // before(async () => {
  //   try {
  //     await createRelayNode(RELAY_PORT, [], RELAY_PEER_ID);
  //   } catch (error) {
  //     console.log('error', error);
  //   }
  // });

  it('peer connects to the relay node', async () => {
    if (isBrowser) {
      console.log('browser env');
    } else {
      console.log('not a browser env');
    }

    const peer = new Peer(RELAY_MULTIADDR.toString());
    await peer.init();

    const node = peer.node;
    assert(node);

    node?.addEventListener('peer:connect', async (evt) => {
      console.log('event peer:connect', evt);
      const connection = evt.detail;
      console.log('connected to node', connection.remotePeer.toString());
    });
  });
});
