//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import path from 'path';
import assert from 'assert';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import {
  getConfig as getWatcherConfig,
  wait,
  Database as BaseDatabase,
  Config as WatcherConfig,
  GraphDatabase,
  getSubgraphConfig
} from '@cerc-io/util';
import { GraphQLClient } from '@cerc-io/ipld-eth-client';

import {
  checkGQLEntityInState,
  compareQuery,
  Config,
  getStatesByBlock,
  checkStateMetaData,
  combineState,
  getClients,
  getConfig,
  checkGQLEntitiesInState
} from './utils';

const DEFAULT_ENTITIES_LIMIT = 100;

const log = debug('vulcanize:compare-blocks');

export const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).env(
    'COMPARE'
  ).options({
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
    batchSize: {
      type: 'number',
      default: 1,
      describe: 'No. of blocks to be compared in an interval (default 1)'
    },
    interval: {
      type: 'number',
      default: 1,
      describe: 'Block interval (default 1)'
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
    },
    timeDiff: {
      type: 'boolean',
      describe: 'Compare time taken between GQL queries',
      default: false
    },
    queryEntitiesLimit: {
      type: 'number',
      default: DEFAULT_ENTITIES_LIMIT,
      describe: 'Limit for entities returned in query'
    },
    paginate: {
      type: 'boolean',
      describe: 'Paginate in multiple entities query and compare',
      default: false
    }
  }).argv;

  const {
    startBlock,
    endBlock,
    batchSize,
    interval,
    rawJson,
    queryDir,
    fetchIds,
    configFile,
    timeDiff,
    queryEntitiesLimit,
    paginate
  } = argv;

  const config: Config = await getConfig(configFile);
  const snakeNamingStrategy = new SnakeNamingStrategy();
  const clients = await getClients(config, timeDiff, queryDir);
  const queryNames = config.queries.names;
  let diffFound = false;
  let blockDelay = wait(0);
  let subgraphContracts: string[] = [];
  const contractLatestStateCIDMap: Map<string, { diff: string, checkpoint: string }> = new Map();
  let db: GraphDatabase | undefined, subgraphGQLClient: GraphQLClient | undefined;

  if (config.watcher) {
    const watcherConfigPath = path.resolve(path.dirname(configFile), config.watcher.configPath);
    const entitiesDir = path.resolve(path.dirname(configFile), config.watcher.entitiesDir);
    const watcherConfig: WatcherConfig = await getWatcherConfig(watcherConfigPath);

    const baseDatabase = new BaseDatabase({ ...watcherConfig.database, entities: [entitiesDir] });
    await baseDatabase.init();

    db = new GraphDatabase(watcherConfig.server, baseDatabase);
    await db.init();

    if (config.watcher.verifyState) {
      // Use provided contracts if available; else read from subraph config.
      if (config.watcher.contracts) {
        subgraphContracts = config.watcher.contracts;
      } else {
        const { dataSources } = await getSubgraphConfig(watcherConfig.server.subgraphPath);
        subgraphContracts = dataSources.map((dataSource: any) => dataSource.source.address);
      }

      const watcherEndpoint = config.endpoints[config.watcher.endpoint] as string;
      subgraphGQLClient = new GraphQLClient({ gqlEndpoint: watcherEndpoint });
    }

    subgraphContracts.forEach(subgraphContract => {
      contractLatestStateCIDMap.set(subgraphContract, { diff: '', checkpoint: '' });
    });
  }

  for (let bathchStart = startBlock; bathchStart <= endBlock; bathchStart += interval) {
    const batchEnd = bathchStart + batchSize;
    for (let blockNumber = bathchStart; blockNumber < batchEnd && blockNumber <= endBlock; blockNumber++) {
      const block = { number: blockNumber };
      const updatedEntityIds: { [entityName: string]: string[] } = {};
      const updatedEntities: Set<string> = new Set();
      let stateByBlock = {};
      assert(db);
      console.time(`time:compare-block-${blockNumber}`);

      if (fetchIds) {
        // Fetch entity ids updated at block.
        console.time(`time:fetch-updated-ids-${blockNumber}`);

        for (const entityName of Object.values(queryNames)) {
          updatedEntityIds[entityName] = await db.getEntityIdsAtBlockNumber(
            blockNumber,
            snakeNamingStrategy.tableName(entityName, '')
          );
        }
        console.timeEnd(`time:fetch-updated-ids-${blockNumber}`);
      } else {
        for (const entityName of Object.values(queryNames)) {
          const isUpdated = await db.isEntityUpdatedAtBlockNumber(
            blockNumber,
            snakeNamingStrategy.tableName(entityName, '')
          );

          if (isUpdated) {
            updatedEntities.add(entityName);
          }
        }
      }

      if (config.watcher.verifyState) {
        assert(db);
        const [block] = await db.getBlocksAtHeight(blockNumber, false);
        assert(subgraphGQLClient);
        const contractStatesByBlock = await getStatesByBlock(subgraphGQLClient, subgraphContracts, block.blockHash);

        // Check meta data for each State entry found
        contractStatesByBlock.flat().forEach(contractStateEntry => {
          const stateMetaDataDiff = checkStateMetaData(contractStateEntry, contractLatestStateCIDMap, rawJson);
          if (stateMetaDataDiff) {
            log('Results mismatch for State meta data:', stateMetaDataDiff);
            diffFound = true;
          }
        });

        stateByBlock = combineState(contractStatesByBlock.flat());
      }

      await blockDelay;
      for (const [queryName, entityName] of Object.entries(queryNames)) {
        try {
          log(`At block ${blockNumber} for query ${queryName}:`);

          if (fetchIds) {
            const queryLimit = config.queries.queryLimits[queryName];

            if (queryLimit) {
              // Take only last `queryLimit` entity ids to compare in GQL.
              const idsLength = updatedEntityIds[entityName].length;
              updatedEntityIds[entityName].splice(0, idsLength - queryLimit);
            }

            for (const id of updatedEntityIds[entityName]) {
              const { diff, result1: result } = await compareQuery(
                clients,
                queryName,
                { block, id },
                rawJson,
                timeDiff
              );

              if (config.watcher.verifyState) {
                const stateDiff = await checkGQLEntityInState(stateByBlock, entityName, result[queryName], id, rawJson, config.watcher.skipFields);

                if (stateDiff) {
                  log('Results mismatch for State:', stateDiff);
                  diffFound = true;
                }
              }

              if (diff) {
                log('Results mismatch:', diff);
                diffFound = true;
              } else {
                log('Results match.');
              }
            }
          } else {
            if (updatedEntities.has(entityName)) {
              let resultDiff;
              let result;
              let skip = 0;

              do {
                ({ diff: resultDiff, result1: result } = await compareQuery(
                  clients,
                  queryName,
                  {
                    block,
                    skip,
                    first: queryEntitiesLimit
                  },
                  rawJson,
                  timeDiff
                ));

                if (config.watcher.verifyState) {
                  const stateDiff = await checkGQLEntitiesInState(stateByBlock, entityName, result[queryName], rawJson, config.watcher.skipFields);

                  if (stateDiff) {
                    log('Results mismatch for State:', stateDiff);
                    diffFound = true;
                  }
                }

                skip += queryEntitiesLimit;
              } while (
                // Check if needed to query more entities.
                result[queryName].length === queryEntitiesLimit &&
                // Check if diff found.
                !diffFound &&
                !resultDiff &&
                // Check paginate flag
                // eslint-disable-next-line no-unmodified-loop-condition
                paginate
              );

              if (resultDiff) {
                log('Results mismatch:', resultDiff);
                diffFound = true;
              } else {
                log('Results match.');
              }
            }
          }
        } catch (err: any) {
          log('Error:', err.message);
          log('Error:', JSON.stringify(err, null, 2));
        }
      }

      // Set delay between requests for a block.
      blockDelay = wait(config.queries.blockDelayInMs || 0);

      console.timeEnd(`time:compare-block-${blockNumber}`);
    }
  }

  if (diffFound) {
    process.exit(1);
  }
};
