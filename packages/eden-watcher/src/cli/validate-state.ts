//
// Copyright 2022 Vulcanize, Inc.
//

import path from 'path';
import util from 'util';
import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { diffString, diff } from 'json-diff';

import { Config, getConfig, JobQueue, DEFAULT_CONFIG_PATH, initClients, StateKind } from '@cerc-io/util';
import { GraphWatcher, Database as GraphDatabase } from '@cerc-io/graph-node';

import { Database } from '../database';
import { Indexer } from '../indexer';
import { getContractEntitiesMap, createStateFromUpdatedEntities } from '../fill-state';

const log = debug('vulcanize:validate-state');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).env(
    'VALIDATE'
  ).options({
    configFile: {
      alias: 'f',
      type: 'string',
      demandOption: true,
      describe: 'configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
    },
    startBlock: {
      type: 'number',
      demandOption: true,
      describe: 'Block number to start state valildation at'
    },
    endBlock: {
      type: 'number',
      demandOption: true,
      describe: 'Block number to stop state valildation at'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, 'entity/*'));
  await graphDb.init();

  const graphWatcher = new GraphWatcher(graphDb, ethClient, ethProvider, config.server);

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue, graphWatcher);
  await indexer.init();

  graphWatcher.setIndexer(indexer);
  await graphWatcher.init();

  await validateState(indexer, graphDb, graphWatcher.dataSources, argv);
};

export const validateState = async (
  indexer: Indexer,
  graphDb: GraphDatabase,
  dataSources: any[],
  argv: {
    startBlock: number,
    endBlock: number
  }
): Promise<void> => {
  const { startBlock, endBlock } = argv;
  if (startBlock > endBlock) {
    log('endBlock should be greater than or equal to startBlock');
    process.exit(1);
  }

  log(`Validating state for subgraph entities in range: [${startBlock}, ${endBlock}]`);

  // Map: contractAddress -> entities updated
  const contractEntitiesMap = getContractEntitiesMap(dataSources);

  console.time('time:validate-state');

  let diffFound = false;
  // Validate state for blocks in the given range
  for (let blockNumber = startBlock; blockNumber <= endBlock && !diffFound; blockNumber++) {
    console.time(`time:validate-state-${blockNumber}`);

    // Get the canonical block hash at current height
    const blocks = await indexer.getBlocksAtHeight(blockNumber, false);

    if (blocks.length === 0) {
      log(`block not found at height ${blockNumber}`);
      process.exit(1);
    } else if (blocks.length > 1) {
      log(`found more than one non-pruned block at height ${blockNumber}`);
      process.exit(1);
    }

    const blockHash = blocks[0].blockHash;

    // Create state from entities of each contract in contractEntitiesMap
    createStateFromUpdatedEntities(indexer, graphDb, blockHash, contractEntitiesMap);

    const comparisonPromises = Array.from(indexer._subgraphStateMap.entries())
      .map(async ([contractAddress, data]): Promise<string> => {
        const ipldBlock = await indexer.getLatestIPLDBlock(contractAddress, StateKind.Diff, blockNumber);
        const ipldState = ipldBlock ? indexer.getIPLDData(ipldBlock).data.state : {};

        return compareObjects(data, ipldState, false);
      });

    const comparisonResults = await Promise.all(comparisonPromises);

    comparisonResults.forEach(resultDiff => {
      if (resultDiff) {
        log('Results mismatch:', resultDiff);
        diffFound = true;
      } else {
        log('Results match.');
      }
    });

    console.timeEnd(`time:validate-state-${blockNumber}`);
  }

  console.timeEnd('time:validate-state');

  log(`Validated state for subgraph entities in range: [${startBlock}, ${endBlock}]`);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});

// obj1: expected
// obj2: actual
const compareObjects = (obj1: any, obj2: any, rawJson: boolean): string => {
  if (rawJson) {
    const diffObj = diff(obj1, obj2);

    if (diffObj) {
      // Use util.inspect to extend depth limit in the output.
      return util.inspect(diffObj, false, null);
    }

    return '';
  } else {
    return diffString(obj1, obj2);
  }
};
