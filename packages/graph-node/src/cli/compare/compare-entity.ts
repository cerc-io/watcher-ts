//
// Copyright 2021 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import path from 'path';
import toml from 'toml';
import fs from 'fs-extra';
import assert from 'assert';
import _ from 'lodash';

import { Client } from './client';

const log = debug('vulcanize:compare');

const DEFAULT_CONFIG_PATH = './src/cli/compare/config.toml';

interface EndpointConfig {
  gqlEndpoint1: string;
  gqlEndpoint2: string;
}

interface Config {
  endpoints: EndpointConfig;
}

const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'f',
      type: 'string',
      describe: 'Configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
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
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { client1, client2 } = await getClients(config);

  const queryName = argv.queryName;
  const id = argv.entityId;
  const blockHash = argv.blockHash;

  const result1 = await client1.getEntity({ queryName, id, blockHash });
  const result2 = await client2.getEntity({ queryName, id, blockHash });

  if (!compareResults(result1, result2)) {
    const message = `Fetch results for entity ${argv.entityName} not equal`;
    throw new Error(message);
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

async function getClients (config: Config): Promise<{
  client1: Client,
  client2: Client
}> {
  assert(config.endpoints, 'Missing endpoints config');

  const gqlEndpoint1 = config.endpoints.gqlEndpoint1;
  const gqlEndpoint2 = config.endpoints.gqlEndpoint2;

  assert(gqlEndpoint1, 'Missing endpoint one');
  assert(gqlEndpoint2, 'Missing endpoint two');

  const client1 = new Client({
    gqlEndpoint: gqlEndpoint1
  });

  const client2 = new Client({
    gqlEndpoint: gqlEndpoint2
  });

  return {
    client1,
    client2
  };
}

function compareResults (result1: any, result2: any): boolean {
  return _.isEqual(result1, result2);
}

main().catch(err => {
  log(err);
  process.exit(1);
}).finally(() => {
  process.exit(0);
});
