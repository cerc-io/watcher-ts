//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import path from 'path';
import assert from 'assert';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import _ from 'lodash';
import { getConfig as getWatcherConfig, wait } from '@vulcanize/util';
import { GraphQLClient } from '@vulcanize/ipld-eth-client';

import { checkEntityInIPLDState, compareQuery, Config, getBlockIPLDState as getIPLDStateByBlock, getClients, getConfig } from './utils';
import { Database } from '../../database';
import { getSubgraphConfig } from '../../utils';

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
  const clients = await getClients(config, queryDir);
  const queryNames = config.queries.names;
  let diffFound = false;
  let blockDelay = wait(0);
  let subgraphContracts: string[] = [];
  let db: Database | undefined, subgraphGQLClient: GraphQLClient | undefined;

  if (config.watcher) {
    const watcherConfigPath = path.resolve(path.dirname(configFile), config.watcher.configPath);
    const entitiesDir = path.resolve(path.dirname(configFile), config.watcher.entitiesDir);
    const watcherConfig = await getWatcherConfig(watcherConfigPath);
    db = new Database(watcherConfig.database, entitiesDir);
    await db.init();

    if (config.watcher.verifyState) {
      const { dataSources } = await getSubgraphConfig(watcherConfig.server.subgraphPath);
      subgraphContracts = dataSources.map((dataSource: any) => dataSource.source.address);
      const watcherEndpoint = config.endpoints[config.watcher.endpoint] as string;
      subgraphGQLClient = new GraphQLClient({ gqlEndpoint: watcherEndpoint });
    }
  }

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    const block = { number: blockNumber };
    let updatedEntityIds: string[][] = [];
    let ipldStateByBlock = {};
    console.time(`time:compare-block-${blockNumber}`);

    if (fetchIds) {
      // Fetch entity ids updated at block.
      console.time(`time:fetch-updated-ids-${blockNumber}`);

      const updatedEntityIdPromises = queryNames.map(
        queryName => {
          assert(db);

          return db.getEntityIdsAtBlockNumber(
            blockNumber,
            snakeNamingStrategy.tableName(queryName, '')
          );
        }
      );

      updatedEntityIds = await Promise.all(updatedEntityIdPromises);
      console.timeEnd(`time:fetch-updated-ids-${blockNumber}`);
    }

    if (config.watcher.verifyState) {
      assert(db);
      const [block] = await db?.getBlocksAtHeight(blockNumber, false);
      assert(subgraphGQLClient);
      ipldStateByBlock = await getIPLDStateByBlock(subgraphGQLClient, subgraphContracts, block.blockHash);
    }

    await blockDelay;
    for (const [index, queryName] of queryNames.entries()) {
      try {
        log(`At block ${blockNumber} for query ${queryName}:`);
        let resultDiff = '';

        if (fetchIds) {
          const queryLimit = config.queries.queryLimits[queryName];

          if (queryLimit) {
            // Take only first `queryLimit` entity ids to compare in GQL.
            updatedEntityIds[index].splice(queryLimit);
          }

          for (const id of updatedEntityIds[index]) {
            const { diff, result1: result } = await compareQuery(
              clients,
              queryName,
              { block, id },
              rawJson
            );

            if (config.watcher.verifyState) {
              const ipldDiff = await checkEntityInIPLDState(ipldStateByBlock, queryName, result, id, rawJson, config.watcher.derivedFields);

              if (ipldDiff) {
                log('Results mismatch for IPLD state:', ipldDiff);
                diffFound = true;
              }
            }

            if (diff) {
              resultDiff = diff;
            }
          }
        } else {
          ({ diff: resultDiff } = await compareQuery(
            clients,
            queryName,
            { block },
            rawJson
          ));
        }

        if (resultDiff) {
          log('Results mismatch:', resultDiff);
          diffFound = true;
        } else {
          log('Results match.');
        }
      } catch (err: any) {
        log('Error:', err.message);
      }
    }

    // Set delay between requests for a block.
    blockDelay = wait(config.queries.blockDelayInMs || 0);

    console.timeEnd(`time:compare-block-${blockNumber}`);
  }

  if (diffFound) {
    process.exit(1);
  }
};
