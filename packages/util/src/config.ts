//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs-extra';
import path from 'path';
import toml from 'toml';
import debug from 'debug';
import { ConnectionOptions } from 'typeorm';

import { Config as CacheConfig } from '@cerc-io/cache';
// @ts-expect-error https://github.com/microsoft/TypeScript/issues/49721#issuecomment-1319854183
import type { PubsubType } from '@cerc-io/peer';

const log = debug('vulcanize:config');

export interface JobQueueConfig {
  dbConnectionString: string;
  maxCompletionLagInSecs: number;
  jobDelayInMilliSecs?: number;
  eventsInBatch: number;
  lazyUpdateBlockProgress?: boolean;
  subgraphEventsOrder: boolean;
  blockDelayInMilliSecs: number;
  // Block range in which logs are fetched during historical blocks processing
  historicalLogsBlockRange?: number;
  // Max block range of historical processing after which it waits for completion of events processing
  // If set to -1 historical processing does not wait for events processing and completes till latest canonical block
  historicalMaxFetchAhead?: number;
  // Boolean to switch between modes of processing events when starting the server
  // Setting to true will fetch filtered events and required blocks in a range of blocks and then process them
  // Setting to false will fetch blocks consecutively with its events and then process them (Behaviour is followed in realtime processing near head)
  useBlockRanges: boolean;
}

export interface GQLCacheConfig {
  enabled: boolean;
  maxCacheSize?: number;
  maxAge: number;
  timeTravelMaxAge: number;
}

// Relay node config
export interface RelayConfig {
  // Host to bind the relay server to
  host?: string;

  // Port to start listening on
  port?: number;

  // Relay peer id file path (json)
  peerIdFile?: string;

  // Domain name to be used in the announce address
  announce?: string;

  // Relay peer multiaddr(s) list
  relayPeers?: string[];

  // Blacklisted multiaddr(s) list
  denyMultiaddrs?: string[];

  // Timeout (ms) for dial to relay peers
  dialTimeout?: number;

  // Interval in ms to check relay peer connections using ping
  pingInterval?: number;

  // Redial interval in ms on connection failure
  redialInterval?: number;

  // Max number of dial retries to be attempted to a relay peer
  maxDialRetry?: number;

  // Pubsub to use ('floodsub' | 'gossipsub')
  pubsub?: PubsubType;

  // Broadcast node's info over pubsub on requests
  enableDebugInfo?: boolean;
}

// L2 tx config
interface L2TxsConfig {
  // Address of contract for which txs are sent
  contractAddress: string;

  // Private key of tx signer (needs to have some balance)
  privateKey: string;

  // Gas limit for tx
  gasLimit?: number;
}

// Peer config
export interface PeerConfig {
  // Multiaddr of the primary relay node for this peer
  relayMultiaddr: string;

  // Pubsub topic to subscribe this peer to
  pubSubTopic: string;

  // Interval (ms) to check relay peer connections using ping
  pingInterval?: number;

  // Ping timeout (ms) used to check if connection is alive
  pingTimeout?: number;

  // Max number of relay node connections for a peer
  maxRelayConnections?: number;

  // Redial interval (ms) to relay node on connection failure
  relayRedialInterval?: number;

  // Blacklisted multiaddr(s) list
  denyMultiaddrs?: string[];

  // Max number of connections for a peer
  maxConnections?: number;

  // Timeout (ms) for dial to peers
  dialTimeout?: number;

  // Peer id file path (json)
  peerIdFile?: string;

  // Pubsub to use ('floodsub' | 'gossipsub')
  pubsub?: PubsubType;

  // Direct peers list (only required with gossipsub)
  directPeers?: string[];

  // Participate in exchange of debug info over pubsub
  enableDebugInfo?: boolean;

  // Enable sending txs to L2 chain for every message received in P2P network
  enableL2Txs: boolean;

  // Config for sending txs to L2
  l2TxsConfig?: L2TxsConfig;
}

export interface BaseRatesConfig {
  freeQueriesLimit: number;
  freeQueriesList: string[];
  queries: { [key: string]: string };
  mutations: { [key: string]: string };
}

export interface PaymentsCacheConfig {
  maxAccounts: number;
  accountTTLInSecs: number;
  maxVouchersPerAccount: number;
  voucherTTLInSecs: number;
  maxPaymentChannels: number;
  paymentChannelTTLInSecs: number;
}

// Payments manager config
export interface PaymentsConfig {
  ratesFile: string;
  requestTimeoutInSecs: number;
  cache: PaymentsCacheConfig;
}

// ts-nitro config
export interface NitroConfig {
  chainUrl: string;
  store: string;

  privateKey: string;
  chainPrivateKey: string;

  payments: PaymentsConfig;
}

// Consensus config
export interface ConsensusConfig {
  enabled: boolean;
  publicKey: string;
  privateKey: string;
  watcherPartyPeersFile: string;
}

// P2P config
export interface P2PConfig {
  // Enable relay node
  enableRelay: boolean;
  relay: RelayConfig;

  // Enable peer node
  enablePeer: boolean;
  peer: PeerConfig;

  nitro: NitroConfig;

  consensus: ConsensusConfig;
}

export interface ServerConfig {
  host: string;
  port: number;
  mode: string;
  gqlPath: string;
  kind: string;
  enableConfigValidation: boolean;
  checkpointing: boolean;
  checkpointInterval: number;
  subgraphPath: string;
  enableState: boolean;
  wasmRestartBlocksInterval: number;
  maxEventsBlockRange: number;
  clearEntitiesCacheInterval: number;

  // Boolean to skip updating entity fields required in state creation and not required in the frontend
  skipStateFieldsUpdate: boolean;

  // Max GQL API requests to process simultaneously (defaults to 1)
  maxSimultaneousRequests?: number;

  // Max GQL API requests in queue until reject (defaults to -1, means do not reject)
  maxRequestQueueLimit?: number;

  // Boolean to load GQL query nested entity relations sequentially
  loadRelationsSequential: boolean;

  // GQL cache-control max-age settings (in seconds)
  gqlCache: GQLCacheConfig;

  p2p: P2PConfig;

  // TODO: Move flag to config upstream.ethServer
  // Flag to specify whether RPC endpoint supports block hash as block tag parameter
  // https://ethereum.org/en/developers/docs/apis/json-rpc/#default-block
  rpcSupportsBlockHashParam: boolean;
}

export interface FundingAmountsConfig {
  directFund: string;
  virtualFund: string;
}
export interface NitroPeerConfig {
  address: string;
  multiAddr: string;
  fundingAmounts: FundingAmountsConfig;
}

export interface EthServerPaymentsConfig {
  nitro: NitroPeerConfig;
  paidRPCMethods: string[];
  amount: string;
}

export interface UpstreamConfig {
  cache: CacheConfig;
  ethServer: {
    gqlApiEndpoint: string;
    rpcProviderEndpoints: string[];
    rpcProviderMutationEndpoint: string;
    // Boolean flag to specify if rpc-eth-client should be used for RPC endpoint instead of ipld-eth-client (ipld-eth-server GQL client)
    rpcClient: boolean;
    // Boolean flag to specify if rpcProviderEndpoint is an FEVM RPC endpoint
    isFEVM: boolean;
    // Boolean flag to filter event logs by contracts
    filterLogsByAddresses: boolean;
    // Boolean flag to filter event logs by topics
    filterLogsByTopics: boolean;
    payments: EthServerPaymentsConfig;
  }
  traceProviderEndpoint: string;
}

export interface GQLMetricsConfig {
  port: number;
}

export interface MetricsConfig {
  host: string;
  port: number;
  gql: GQLMetricsConfig;
}

export interface Config {
  server: ServerConfig;
  database: ConnectionOptions;
  upstream: UpstreamConfig;
  jobQueue: JobQueueConfig;
  metrics: MetricsConfig;
}

export const getConfig = async<ConfigType> (configFile: string): Promise<ConfigType> => {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const config = toml.parse(await fs.readFile(configFilePath, 'utf8'));
  log('config', JSON.stringify(config, null, 2));

  return config;
};
