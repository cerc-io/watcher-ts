//
// Copyright 2021 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import path from 'path';
import toml from 'toml';
import fs from 'fs-extra';
import assert from 'assert';
import util from 'util';
import { diffString, diff } from 'json-diff';

import { Client } from './client';

interface EndpointConfig {
  gqlEndpoint1: string;
  gqlEndpoint2: string;
}

interface QueryConfig {
  queryDir: string;
}

interface Config {
  endpoints: EndpointConfig;
  queries: QueryConfig;
}

export const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'cf',
      type: 'string',
      demandOption: true,
      describe: 'Configuration file path (toml)'
    },
    queryDir: {
      alias: 'qf',
      type: 'string',
      describe: 'Path to queries directory'
    },
    blockHash: {
      alias: 'b',
      type: 'string',
      demandOption: true,
      describe: 'Blockhash'
    },
    queryName: {
      alias: 'q',
      type: 'string',
      demandOption: true,
      describe: 'Query name'
    },
    entityId: {
      alias: 'i',
      type: 'string',
      demandOption: true,
      describe: 'Id of the entity to be queried'
    },
    rawJson: {
      alias: 'j',
      type: 'boolean',
      describe: 'Whether to print out raw diff object',
      default: false
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);

  const { client1, client2 } = await getClients(config, argv.queryDir);

  const queryName = argv.queryName;
  const id = argv.entityId;
  const blockHash = argv.blockHash;

  const result1 = await client1.getEntity({ blockHash, queryName, id });
  const result2 = await client2.getEntity({ blockHash, queryName, id });

  // Getting the diff of two result objects.
  let resultDiff;
  if (argv.rawJson) {
    resultDiff = diff(result1, result2);

    if (resultDiff) {
      // Use util.inspect to extend depth limit in the output.
      resultDiff = util.inspect(diff(result1, result2), false, null);
    }
  } else {
    resultDiff = diffString(result1, result2);
  }

  if (resultDiff) {
    console.log(resultDiff);
    process.exit(1);
  }
};

async function getConfig (configFile: string): Promise<Config> {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const config = toml.parse(await fs.readFile(configFilePath, 'utf8'));

  return config;
}

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
