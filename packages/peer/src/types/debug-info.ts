//
// Copyright 2023 Vulcanize, Inc.
//

import type { Direction } from '@libp2p/interface-connection';
import { RegistryMetricData } from '@cerc-io/prometheus-metrics';

export interface SelfInfo {
  peerId: string;
  multiaddrs: string[];
}

export interface PeerSelfInfo extends SelfInfo {
  primaryRelayMultiaddr: string;
  primaryRelayPeerId: string | null;
}

export enum ConnectionType {
  Relayed = 'relayed',
  Direct = 'direct'
}

export interface ConnectionInfo {
  id: string;
  peerId: string;
  multiaddr: string;
  direction: Direction;
  status: string;
  latency: number[];
  type: ConnectionType;
}

export interface PeerConnectionInfo extends ConnectionInfo {
  isPeerRelay: boolean;
  isPeerRelayPrimary: boolean;
  hopRelayPeerId?: string | null;
}

export interface DebugPeerInfo {
  selfInfo: PeerSelfInfo;
  connInfo: PeerConnectionInfo[];
  metrics: Map<string, RegistryMetricData<any>>;
}

export interface DebugRelayInfo {
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
  peerInfo: DebugPeerInfo | DebugRelayInfo
}

export type DebugMsg = DebugRequest | DebugResponse
