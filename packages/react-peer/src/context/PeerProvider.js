import React from 'react';

import { Peer } from '@cerc-io/peer';

import { PeerContext } from './PeerContext';

export const PeerProvider = ({ signalServer, relayNode, children }) => {
  const [peer, setPeer] = React.useState(null);

  React.useEffect(() => {
    const init = async () => {
      const peer = new Peer()
      await peer.init(signalServer, relayNode);

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
