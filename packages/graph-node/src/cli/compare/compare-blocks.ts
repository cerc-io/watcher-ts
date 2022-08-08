//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import assert from 'assert';

import { compareQuery, Config, getClients, getConfig } from './utils';
import { Client } from './client';

const log = debug('vulcanize:compare-blocks');

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
    startBlock: {
      type: 'number',
      demandOption: true,
      describe: 'Start block number'
    },
    endBlock: {
      type: 'number',
      demandOption: true,
      describe: 'End block number'
    },
    rawJson: {
      alias: 'j',
      type: 'boolean',
      describe: 'Whether to print out raw diff object',
      default: false
    },
    fetchIds: {
      type: 'boolean',
      describe: 'Fetch ids and compare multiple entities',
      default: false
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);

  const { startBlock, endBlock, rawJson, queryDir, fetchIds } = argv;
  const queryNames = config.queries.names;
  let diffFound = false;

  const clients = await getClients(config, queryDir);

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    const block = { number: blockNumber };
    console.time(`time:compare-block-${blockNumber}`);

    for (const queryName of queryNames) {
      try {
        log(`At block ${blockNumber} for query ${queryName}:`);

        if (fetchIds) {
          const { idsEndpoint } = config.queries;
          assert(idsEndpoint, 'Specify endpoint for fetching ids when fetchId is true');
          const client = Object.values(clients).find(client => client.endpoint === config.endpoints[idsEndpoint]);
          assert(client);
          const ids = await client.getIds(queryName, blockNumber);

          for (const id of ids) {
            const isDiff = await compareAndLog(clients, queryName, { block, id }, rawJson);

            if (isDiff) {
              diffFound = isDiff;
            }
          }
        } else {
          const isDiff = await compareAndLog(clients, queryName, { block }, rawJson);

          if (isDiff) {
            diffFound = isDiff;
          }
        }
      } catch (err: any) {
        log('Error:', err.message);
      }
    }

    console.timeEnd(`time:compare-block-${blockNumber}`);
  }

  if (diffFound) {
    process.exit(1);
  }
};

const compareAndLog = async (
  clients: { client1: Client, client2: Client },
  queryName: string,
  params: { [key: string]: any },
  rawJson: boolean
): Promise<boolean> => {
  const resultDiff = await compareQuery(
    clients,
    queryName,
    params,
    rawJson
  );

  if (resultDiff) {
    log('Results mismatch:', resultDiff);
    return true;
  }

  log('Results match.');
  return false;
};
