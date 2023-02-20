//
// Copyright 2023 Vulcanize, Inc.
//

import { Libp2p } from '@cerc-io/libp2p';
import { Multiaddr } from '@multiformats/multiaddr';
import { uniqueNamesGenerator, adjectives, colors, names } from 'unique-names-generator';

interface DialWithRetryOptions {
  redialDelay: number
  maxRetry: number
}

const DEFAULT_DIAL_RETRY_OPTIONS: DialWithRetryOptions = {
  redialDelay: 5000, // ms
  maxRetry: 5
};

/**
 * Method to dial remote peer multiaddr with retry on failure
 * Number of retries can be configured using options.maxRetry
 * @param node
 * @param multiaddr
 * @param options
 */
export const dialWithRetry = async (node: Libp2p, multiaddr: Multiaddr, options: Partial<DialWithRetryOptions>) => {
  const { redialDelay, maxRetry } = {
    ...DEFAULT_DIAL_RETRY_OPTIONS,
    ...options
  };

  // Keep dialling node until it connects
  for (let i = 0; i < maxRetry; i++) {
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

  throw new Error(`Stopping dial retry after ${maxRetry} attempts for multiaddr ${multiaddr.toString()}`);
};

/**
 * Get a deterministic pseudonym of form [adjective-color-name] for a given libp2p peer id
 * Eg. 12D3KooWJLXEX2GfHPSZR3z9QKNSN8EY6pXo7FZ9XtFhiKLJATtC -> jolly-green-diann
 * @param peerId
 */
export const getPseudonymForPeerId = (peerId: string): string => {
  return uniqueNamesGenerator({
    seed: peerId,
    dictionaries: [adjectives, colors, names],
    length: 3,
    style: 'lowerCase',
    separator: '-'
  });
};
