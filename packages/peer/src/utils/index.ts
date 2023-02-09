//
// Copyright 2023 Vulcanize, Inc.
//

import { Libp2p } from '@cerc-io/libp2p';
import { Multiaddr } from '@multiformats/multiaddr';

/**
 * Method to dial remote peer multiaddr with retry on failure
 * @param node
 * @param multiaddr
 * @param redialDelay
 */
export const dialWithRetry = async (node: Libp2p, multiaddr: Multiaddr, redialDelay: number) => {
  // Keep dialling node until it connects
  while (true) {
    try {
      console.log(`Dialling node ${multiaddr.getPeerId()} using multiaddr ${multiaddr.toString()}`);
      const connection = await node.dial(multiaddr);

      return connection;
    } catch (err) {
      console.log(`Could not dial node ${multiaddr.toString()}`, err);
      console.log(`Retrying after ${redialDelay}ms`);

      // TODO: Use wait method from util package.
      // Issue using util package in react app.
      await new Promise(resolve => setTimeout(resolve, redialDelay));
    }
  }
};
