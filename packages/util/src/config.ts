//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import toml from 'toml';
import debug from 'debug';
import { ConnectionOptions } from 'typeorm';

import { Config as CacheConfig, getCache } from '@cerc-io/cache';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { JsonRpcProvider } from '@ethersproject/providers';

import { getCustomProvider } from './misc';

const log = debug('vulcanize:config');

export interface JobQueueConfig {
  dbConnectionString: string;
  maxCompletionLagInSecs: number;
  jobDelayInMilliSecs?: number;
  eventsInBatch: number;
  lazyUpdateBlockProgress?: boolean;
  subgraphEventsOrder: boolean;
  blockDelayInMilliSecs: number;
  prefetchBlocksInMem: boolean;
  prefetchBlockCount: number;
}

export interface ServerConfig {
  host: string;
  port: number;
  mode: string;
  kind: string;
  checkpointing: boolean;
  checkpointInterval: number;
  subgraphPath: string;
  enableState: boolean;
  wasmRestartBlocksInterval: number;
  filterLogs: boolean;
  maxEventsBlockRange: number;
  clearEntitiesCacheInterval: number;

  // Boolean to skip updating entity fields required in state creation and not required in the frontend.
  skipStateFieldsUpdate: boolean;

  // Max GQL API requests to process simultaneously (defaults to 1).
  maxSimultaneousRequests?: number;

  // Max GQL API requests in queue until reject (defaults to -1, means do not reject).
  maxRequestQueueLimit?: number;

  // Boolean to load GQL query nested entity relations sequentially.
  loadRelationsSequential: boolean;
}

export interface UpstreamConfig {
  cache: CacheConfig,
  ethServer: {
    gqlApiEndpoint: string;
    rpcProviderEndpoint: string;
  }
  traceProviderEndpoint: string;
  uniWatcher: {
    gqlEndpoint: string;
    gqlSubscriptionEndpoint: string;
  };
  tokenWatcher: {
    gqlEndpoint: string;
    gqlSubscriptionEndpoint: string;
  }
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
  upstream: UpstreamConfig,
  jobQueue: JobQueueConfig,
  metrics: MetricsConfig,
}

export const getConfig = async (configFile: string): Promise<Config> => {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const config = toml.parse(await fs.readFile(configFilePath, 'utf8'));
  log('config', JSON.stringify(config, null, 2));

  return config;
};

export const initClients = async (config: Config): Promise<{
  ethClient: EthClient,
  ethProvider: JsonRpcProvider
}> => {
  const { database: dbConfig, upstream: upstreamConfig, server: serverConfig } = config;

  assert(serverConfig, 'Missing server config');
  assert(dbConfig, 'Missing database config');
  assert(upstreamConfig, 'Missing upstream config');

  const { ethServer: { gqlApiEndpoint, rpcProviderEndpoint }, cache: cacheConfig } = upstreamConfig;

  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(rpcProviderEndpoint, 'Missing upstream ethServer.rpcProviderEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    cache
  });

  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  return {
    ethClient,
    ethProvider
  };
};
