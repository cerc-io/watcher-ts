//
// Copyright 2022 Vulcanize, Inc.
//

import fs from 'fs-extra';
import path from 'path';
import assert from 'assert';
import toml from 'toml';

export interface Config {
  endpoint1URL: string,
  endpoint2URL: string,
  blockTag: string
}

export const getConfig = async (configFile: string): Promise<Config> => {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const configString = await fs.readFile(configFilePath, 'utf8');
  const config = toml.parse(configString);

  const { endpoints: endpointConfig, blockTag } = config;
  assert(endpointConfig, 'Missing endpoints config');

  const {endpoint1: endpoint1URL, endpoint2: endpoint2URL} = endpointConfig;
  assert(endpoint1URL, 'Missing endpoint1 URL');
  assert(endpoint2URL, 'Missing endpoint2 URL');

  assert(blockTag);

  return {
    endpoint1URL,
    endpoint2URL,
    blockTag
  };
}

export const readAbi = (abiPath: string): any => {
  const fullAbiPath = path.resolve(abiPath);

  return JSON.parse(fs.readFileSync(fullAbiPath).toString());
}
