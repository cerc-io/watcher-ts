//
// Copyright 2023 Vulcanize, Inc.
//

import type { Direction } from '@libp2p/interface-connection';
import { RegistryMetricData } from '@cerc-io/prometheus-metrics';

export interface SelfInfo {
  peerId: string;
  primaryRelayNode: string;
  multiaddrs: string[];
}

export interface ConnectionInfo {
  id: string;
  peerId: string;
  multiaddr: string;
  direction: Direction;
  status: string;
  type: string;
  nodeType: string;
  latency: number[];
}

export interface DebugPeerInfo {
  selfInfo: SelfInfo;
  connInfo: ConnectionInfo[];
  metrics: Map<string, RegistryMetricData<any>>;
}

export interface DebugRequest {
  type: 'Request'
}

export interface DebugResponse {
  type: 'Response',
  dst: string,
  peerInfo: DebugPeerInfo
}

export type DebugMsg = DebugRequest | DebugResponse
