//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import util from 'util';
import path from 'path';
import toml from 'toml';
import fs from 'fs-extra';
import { diffString, diff } from 'json-diff';

import { Config as CacheConfig, getCache } from '@vulcanize/cache';

import { Client } from './client';

interface EndpointConfig {
  gqlEndpoint1: string;
  gqlEndpoint2: string;
}

interface QueryConfig {
  queryDir: string;
  names: string[];
  idsEndpoint: keyof EndpointConfig;
}

export interface Config {
  endpoints: EndpointConfig;
  queries: QueryConfig;
  cache: {
    endpoint: keyof EndpointConfig;
    config: CacheConfig;
  }
}

export const getConfig = async (configFile: string): Promise<Config> => {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);

  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const config = toml.parse(await fs.readFile(configFilePath, 'utf8'));

  if (config.queries.queryDir) {
    // Resolve path from config file path.
    const configFileDir = path.dirname(configFilePath);
    config.queries.queryDir = path.resolve(configFileDir, config.queries.queryDir);
  }

  return config;
};

export const compareQuery = async (
  clients: {
    client1: Client,
    client2: Client
  },
  queryName: string,
  params: { [key: string]: any },
  rawJson: boolean
): Promise<string> => {
  const { client1, client2 } = clients;

  const result2 = await client2.getResult(queryName, params);
  const result1 = await client1.getResult(queryName, params);

  // Getting the diff of two result objects.
  let resultDiff;

  if (rawJson) {
    resultDiff = diff(result1, result2);

    if (resultDiff) {
      // Use util.inspect to extend depth limit in the output.
      resultDiff = util.inspect(diff(result1, result2), false, null);
    }
  } else {
    resultDiff = diffString(result1, result2);
  }

  return resultDiff;
};

export const getClients = async (config: Config, queryDir?: string):Promise<{
  client1: Client,
  client2: Client
}> => {
  assert(config.endpoints, 'Missing endpoints config');

  const {
    endpoints: { gqlEndpoint1, gqlEndpoint2 },
    cache: { endpoint, config: cacheConfig }
  } = config;

  assert(gqlEndpoint1, 'Missing endpoint one');
  assert(gqlEndpoint2, 'Missing endpoint two');

  if (!queryDir) {
    assert(config.queries, 'Missing queries config');
    queryDir = config.queries.queryDir;
  }

  assert(queryDir, 'Query directory not provided');
  assert(cacheConfig, 'Cache config not provided');
  const cache = await getCache(cacheConfig);

  const client1 = new Client({
    gqlEndpoint: gqlEndpoint1,
    cache: endpoint === 'gqlEndpoint1' ? cache : undefined
  }, queryDir);

  const client2 = new Client({
    gqlEndpoint: gqlEndpoint2,
    cache: endpoint === 'gqlEndpoint2' ? cache : undefined
  }, queryDir);

  return {
    client1,
    client2
  };
};
