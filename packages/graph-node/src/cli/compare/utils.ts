//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import util from 'util';
import path from 'path';
import toml from 'toml';
import fs from 'fs-extra';
import { diffString, diff } from 'json-diff';

import { Client } from './client';

interface EndpointConfig {
  gqlEndpoint1: string;
  gqlEndpoint2: string;
}

interface QueryConfig {
  queryDir: string;
  names: string[];
}

export interface Config {
  endpoints: EndpointConfig;
  queries: QueryConfig;
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
  config: Config,
  queryName: string,
  params: { [key: string]: any },
  rawJson: boolean,
  queryDir?: string
): Promise<string> => {
  const { client1, client2 } = await getClients(config, queryDir);

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

async function getClients (config: Config, queryDir?: string): Promise<{
  client1: Client,
  client2: Client
}> {
  assert(config.endpoints, 'Missing endpoints config');

  const gqlEndpoint1 = config.endpoints.gqlEndpoint1;
  const gqlEndpoint2 = config.endpoints.gqlEndpoint2;

  assert(gqlEndpoint1, 'Missing endpoint one');
  assert(gqlEndpoint2, 'Missing endpoint two');

  if (!queryDir) {
    assert(config.queries, 'Missing queries config');
    queryDir = config.queries.queryDir;
  }

  assert(queryDir, 'Query directory not provided');

  const client1 = new Client({
    gqlEndpoint: gqlEndpoint1
  }, queryDir);

  const client2 = new Client({
    gqlEndpoint: gqlEndpoint2
  }, queryDir);

  return {
    client1,
    client2
  };
}
