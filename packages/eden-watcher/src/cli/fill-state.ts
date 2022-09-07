//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { Config, getConfig, JobQueue, DEFAULT_CONFIG_PATH, initClients, jsonBigIntStringReplacer } from '@vulcanize/util';
import { GraphWatcher, Database as GraphDatabase, resolveEntityFieldConflicts } from '@vulcanize/graph-node';

import { Database } from '../database';
import { Indexer } from '../indexer';

const log = debug('vulcanize:fill-state');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).env(
    'FILL'
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
      describe: 'Block number to start processing at'
    },
    endBlock: {
      type: 'number',
      demandOption: true,
      describe: 'Block number to stop processing at'
    }
  }).argv;

  try {
    const config: Config = await getConfig(argv.configFile);
    const { ethClient, ethProvider } = await initClients(config);

    const db = new Database(config.database);
    await db.init();

    const graphDb = new GraphDatabase(config.database, path.resolve(__dirname, '../entity/*'));
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

    const { startBlock, endBlock } = argv;
    assert(startBlock <= endBlock, 'endBlock should be greater than or equal to startBlock');

    const dataSources = graphWatcher._dataSources;
    const contractEntitiesMap: Map<string, string[]> = new Map();

    dataSources.forEach((dataSource: any) => {
      const { source: { address: contractAddress }, mapping: { entities } } = dataSource;
      contractEntitiesMap.set(contractAddress, entities as string[]);
    });

    for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
      const blocks = await db.getBlocksAtHeight(blockNumber, false);
      assert(blocks.length === 1, `found more than one canonical block at height ${blockNumber}`);
      const blockHash = blocks[0].blockHash;

      const updatePromises = Array.from(contractEntitiesMap.entries())
        .map(async ([contractAddress, entities]): Promise<void> => {
          const updatedEntitiesPromises = entities.map(async (entity): Promise<any[]> => {
            return graphDb.getEntitiesForBlock(blockHash, entity);
          });

          const updatedEntities = await Promise.all(updatedEntitiesPromises);

          updatedEntities.forEach((updates, index) => {
            const entityName = entities[index];
            updates.forEach((update) => {
              update = resolveEntityFieldConflicts(update);
              const diffData: any = { state: {} };

              const result = Array.from(indexer.getRelationsMap().entries())
                .find(([key]) => key.name === entityName);

              if (result) {
                // Update dbData if relations exist.
                const [_, relations] = result;

                // Update relation fields for diff data to be similar to GQL query entities.
                Object.entries(relations).forEach(([relation, { isArray, isDerived }]) => {
                  if (isDerived || !update[relation]) {
                    // Field is not present in dbData for derived relations
                    return;
                  }

                  if (isArray) {
                    update[relation] = update[relation]
                      .map((id: string) => ({ id }))
                      .sort((a: any, b: any) => a.id.localeCompare(b.id));
                  } else {
                    update[relation] = { id: update[relation] };
                  }
                });
              }

              diffData.state[entityName] = {
                // Using custom replacer to store bigints as string values to be encoded by IPLD dag-cbor.
                // TODO: Parse and store as native bigint by using Type encoders in IPLD dag-cbor encode.
                // https://github.com/rvagg/cborg#type-encoders
                [update.id]: JSON.parse(JSON.stringify(update, jsonBigIntStringReplacer))
              };

              console.log('contractAddress', contractAddress);
              console.log('diffData', diffData);

              indexer.updateSubgraphState(contractAddress, diffData);
            });
          });
        });

      await Promise.all(updatePromises);
      await indexer.dumpSubgraphState(blockHash, true);
    }
  } catch (error) {
    console.log(error);
  }
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});
