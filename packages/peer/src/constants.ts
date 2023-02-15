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

// Interval time in ms to check connection with ping for connected peer
// Currently only checking for relay node
export const CONN_CHECK_INTERVAL = 10000; // 10 seconds

// Ping timeout used to check if connection is alive
// Should be lesser than CONN_CHECK_INTERVAL
export const PING_TIMEOUT = 5000; // 5 seconds

// Delay time in ms to redial relay node on failing to connect
export const RELAY_REDIAL_DELAY = 5000; // 5 sconds

// Max number of relay node connections for a peer after which it starts igoring them
export const DEFAULT_MAX_RELAY_CONNECTIONS = 2;

// Range of ports to be used for WebRTC connections
// (option only availabe when running in nodejs)
export const WEBRTC_PORT_RANGE = {
  min: 10000,
  max: 11000
};

// Peer connection manager config constants

// Number of max concurrent dials per peer
export const MAX_CONCURRENT_DIALS_PER_PEER = 3;

// Max number of connections for a peer after which it starts pruning connections
export const MAX_CONNECTIONS = 10;

// Min number of connections for a peer below which autodial triggers (if enabled)
export const MIN_CONNECTIONS = 0;
