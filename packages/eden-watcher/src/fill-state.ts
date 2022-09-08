//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';
import { Between } from 'typeorm';

import { Database as GraphDatabase, prepareEntityState } from '@vulcanize/graph-node';

import { Indexer } from './indexer';

const log = debug('vulcanize:fill-state');

export const fillState = async (
  indexer: Indexer,
  graphDb: GraphDatabase,
  dataSources: any[],
  argv: {
    startBlock: number,
    endBlock: number
  }
): Promise<void> => {
  const { startBlock, endBlock } = argv;
  assert(startBlock <= endBlock, 'endBlock should be greater than or equal to startBlock');

  // NOTE: Assuming all blocks in the given range are in the pruned region
  log(`Filling state for subgraph entities in range: [${startBlock}, ${endBlock}]`);

  // Check that there are no existing diffs in this range
  const existingStates = await indexer.getIPLDBlocks({ block: { blockNumber: Between(startBlock, endBlock) } });
  assert(existingStates.length === 0, 'found existing state(s) in the given range');

  // Map: contractAddress -> entities updated
  const contractEntitiesMap: Map<string, string[]> = new Map();

  // Populate contractEntitiesMap using data sources from subgraph
  // NOTE: Assuming each entity type is only mapped to a single contract
  //       This is true for eden subgraph; may not be the case for other subgraphs
  dataSources.forEach((dataSource: any) => {
    const { source: { address: contractAddress }, mapping: { entities } } = dataSource;
    contractEntitiesMap.set(contractAddress, entities as string[]);
  });

  console.time('time:fill-state');

  // Fill state for blocks in the given range
  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    console.time(`time:fill-state-${blockNumber}`);

    // Get the canonical block hash at current height
    const blocks = await indexer.getBlocksAtHeight(blockNumber, false);
    assert(blocks.length === 1, `found more than one non-pruned block at height ${blockNumber}`);
    const blockHash = blocks[0].blockHash;

    // Fill state for each contract in contractEntitiesMap
    const contractStatePromises = Array.from(contractEntitiesMap.entries())
      .map(async ([contractAddress, entities]): Promise<void> => {
        // Get all the updated entities at this block
        const updatedEntitiesListPromises = entities.map(async (entity): Promise<any[]> => {
          return graphDb.getEntitiesForBlock(blockHash, entity);
        });
        const updatedEntitiesList = await Promise.all(updatedEntitiesListPromises);

        // Populate state with all the updated entities of each entity type
        updatedEntitiesList.forEach((updatedEntities, index) => {
          const entityName = entities[index];

          updatedEntities.forEach((updatedEntity) => {
            // Prepare diff data for the entity update
            const diffData = prepareEntityState(updatedEntity, entityName, indexer.getRelationsMap());

            // Update the in-memory subgraph state
            indexer.updateSubgraphState(contractAddress, diffData);
          });
        });
      });

    await Promise.all(contractStatePromises);

    // Persist subgraph state to the DB
    await indexer.dumpSubgraphState(blockHash, true);

    console.timeEnd(`time:fill-state-${blockNumber}`);
  }

  console.timeEnd('time:fill-state');

  log(`Filled state for subgraph entities in range: [${startBlock}, ${endBlock}]`);
};
