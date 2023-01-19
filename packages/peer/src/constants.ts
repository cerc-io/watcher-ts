//
// Copyright 2023 Vulcanize, Inc.
//

export const PUBSUB_DISCOVERY_INTERVAL = 10000; // 10 seconds
export const PUBSUB_SIGNATURE_POLICY = 'StrictSign';

export const HOP_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day

export const RELAY_TAG = {
  tag: 'laconic:relay-primary',
  value: 100
};

// Peer connection manager config constants
export const MAX_DIALS_PER_PEER = 3;
export const MAX_CONNECTIONS = 10;
export const MIN_CONNECTIONS = 0;
