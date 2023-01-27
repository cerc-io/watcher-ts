import React from 'react';

import { Peer } from '@cerc-io/peer';

import { PeerContext } from './PeerContext';

export const PeerProvider = ({ relayNode, children }) => {
  const [peer, setPeer] = React.useState(null);

  React.useEffect(() => {
    const init = async () => {
      // TODO: Validate prop relayNode
      if (!relayNode) {
        throw new Error('REACT_APP_RELAY_NODE not set')
      }

      const peer = new Peer(relayNode)
      await peer.init();

      // Debug
      console.log(`Peer ID: ${peer.peerId.toString()}`);

      setPeer(peer);
    };

    init();

    return () => {
      if (peer.node) {
        // TODO: Await for peer close
        peer.close()
      }
    }
  }, []);

  return (
    <PeerContext.Provider value={peer}>
      {children}
    </PeerContext.Provider>
  );
};
