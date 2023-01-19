//
// Copyright 2023 Vulcanize, Inc.
//

// How often a peer should broadcast it's peer data over pubsub discovery topic
// (interval at which other peers get corresponding discovery event)
export const PUBSUB_DISCOVERY_INTERVAL = 10000; // 10 seconds

// Use StrictSign signature policy to pass signed pubsub messages
// (includes source peer's id with a signature in the message)
export const PUBSUB_SIGNATURE_POLICY = 'StrictSign';

// Relayed connections between peers drop after hop timeout
// (redialled on discovery)
export const HOP_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day

// Connected peers can be given tags according to their priority
// Create a high value tag for prioritizing primary relay node connection
export const RELAY_TAG = {
  tag: 'laconic:relay-primary',
  value: 100
};

// Peer connection manager config constants

// Number of max concurrent dials per peer
export const MAX_CONCURRENT_DIALS_PER_PEER = 3;

// Max number of connections for a peer after which it starts pruning connections
export const MAX_CONNECTIONS = 10;

// Min number of connections for a peer below which autodial triggers (if enabled)
export const MIN_CONNECTIONS = 0;
