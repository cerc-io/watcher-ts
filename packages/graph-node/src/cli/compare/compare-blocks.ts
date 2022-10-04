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
import { getConfig as getWatcherConfig, wait } from '@cerc-io/util';
import { GraphQLClient } from '@cerc-io/ipld-eth-client';

import { checkEntityInIPLDState, compareQuery, Config, getIPLDsByBlock, checkIPLDMetaData, combineIPLDState, getClients, getConfig } from './utils';
import { Database } from '../../database';
import { getSubgraphConfig } from '../../utils';

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
    }
  }).argv;

  const { startBlock, endBlock, rawJson, queryDir, fetchIds, configFile, timeDiff } = argv;
  const config: Config = await getConfig(configFile);
  const snakeNamingStrategy = new SnakeNamingStrategy();
  const clients = await getClients(config, timeDiff, queryDir);
  const queryNames = config.queries.names;
  let diffFound = false;
  let blockDelay = wait(0);
  let subgraphContracts: string[] = [];
  const contractLatestStateCIDMap: Map<string, { diff: string, checkpoint: string }> = new Map();
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

    subgraphContracts.forEach(subgraphContract => {
      contractLatestStateCIDMap.set(subgraphContract, { diff: '', checkpoint: '' });
    });
  }

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    const block = { number: blockNumber };
    const updatedEntityIds: { [entityName: string]: string[] } = {};
    const updatedEntities: Set<string> = new Set();
    let ipldStateByBlock = {};
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
      const contractIPLDsByBlock = await getIPLDsByBlock(subgraphGQLClient, subgraphContracts, block.blockHash);

      // Check meta data for each IPLD block found
      contractIPLDsByBlock.flat().forEach(contractIPLD => {
        const ipldMetaDataDiff = checkIPLDMetaData(contractIPLD, contractLatestStateCIDMap, rawJson);
        if (ipldMetaDataDiff) {
          log('Results mismatch for IPLD meta data:', ipldMetaDataDiff);
          diffFound = true;
        }
      });

      ipldStateByBlock = combineIPLDState(contractIPLDsByBlock.flat());
    }

    await blockDelay;
    for (const [queryName, entityName] of Object.entries(queryNames)) {
      try {
        log(`At block ${blockNumber} for query ${queryName}:`);
        let resultDiff = '';

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
          if (updatedEntities.has(entityName)) {
            ({ diff: resultDiff } = await compareQuery(
              clients,
              queryName,
              { block },
              rawJson,
              timeDiff
            ));
          }
        }

        if (resultDiff) {
          log('Results mismatch:', resultDiff);
          diffFound = true;
        } else {
          log('Results match.');
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

  if (diffFound) {
    process.exit(1);
  }
};
