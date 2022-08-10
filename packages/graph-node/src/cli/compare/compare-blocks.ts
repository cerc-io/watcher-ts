//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import path from 'path';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { getConfig as getWatcherConfig } from '@vulcanize/util';

import { compareQuery, Config, getClients, getConfig } from './utils';
import { Client } from './client';
import { Database } from '../../database';

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

  const { startBlock, endBlock, rawJson, queryDir, fetchIds, configFile } = argv;
  const config: Config = await getConfig(configFile);
  const snakeNamingStrategy = new SnakeNamingStrategy();
  let db: Database;

  if (fetchIds) {
    const watcherConfigPath = path.resolve(path.dirname(configFile), config.watcher.configPath);
    const entitiesDir = path.resolve(path.dirname(configFile), config.watcher.entitiesDir);
    const watcherConfig = await getWatcherConfig(watcherConfigPath);
    db = new Database(watcherConfig.database, entitiesDir);
    await db.init();
  }

  const clients = await getClients(config, queryDir);
  const queryNames = config.queries.names;
  let diffFound = false;

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    const block = { number: blockNumber };
    let updatedEntityIds: string[][] = [];
    console.time(`time:compare-block-${blockNumber}`);

    if (fetchIds) {
      // Fetch entity ids updated at block.
      console.time(`time:fetch-updated-ids-${blockNumber}`);
      const updatedEntityIdPromises = queryNames.map(
        queryName => db.getEntityIdsAtBlockNumber(
          blockNumber,
          snakeNamingStrategy.tableName(queryName, '')
        )
      );

      updatedEntityIds = await Promise.all(updatedEntityIdPromises);
      console.timeEnd(`time:fetch-updated-ids-${blockNumber}`);
    }

    for (const [index, queryName] of queryNames.entries()) {
      try {
        log(`At block ${blockNumber} for query ${queryName}:`);

        if (fetchIds) {
          for (const id of updatedEntityIds[index]) {
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
