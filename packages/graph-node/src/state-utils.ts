//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';

import { Between } from 'typeorm';
import { IndexerInterface, prepareEntityState } from '@cerc-io/util';

const log = debug('vulcanize:state-utils');

export const updateSubgraphState = (subgraphStateMap: Map<string, any>, contractAddress: string, data: any): void => {
  // Update the subgraph state for a given contract.
  const oldData = subgraphStateMap.get(contractAddress);
  const updatedData = _.merge(oldData, data);
  subgraphStateMap.set(contractAddress, updatedData);
};

export const dumpSubgraphState = async (
  indexer: IndexerInterface,
  subgraphStateMap: Map<string, any>,
  blockHash: string,
  isStateFinalized = false
): Promise<void> => {
  // Create a diff for each contract in the subgraph state map.
  const createDiffPromises = Array.from(subgraphStateMap.entries())
    .map(([contractAddress, data]): Promise<void> => {
      if (isStateFinalized) {
        return indexer.createDiff(contractAddress, blockHash, data);
      }

      return indexer.createDiffStaged(contractAddress, blockHash, data);
    });

  await Promise.all(createDiffPromises);

  // Reset the subgraph state map.
  subgraphStateMap.clear();
};

export const getContractEntitiesMap = (dataSources: any[]): Map<string, string[]> => {
  // Map: contractAddress -> entities updated
  const contractEntitiesMap: Map<string, string[]> = new Map();

  // Populate contractEntitiesMap using data sources from subgraph
  dataSources.forEach((dataSource: any) => {
    const { source: { address: contractAddress }, mapping: { entities } } = dataSource;
    contractEntitiesMap.set(contractAddress, entities as string[]);
  });

  return contractEntitiesMap;
};

export const fillState = async (
  indexer: IndexerInterface,
  contractEntitiesMap: Map<string, string[]>,
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

  // Check that there are no existing diffs in this range
  const existingStates = await indexer.getStates({ block: { blockNumber: Between(startBlock, endBlock) } });
  if (existingStates.length > 0) {
    log('found existing state(s) in the given range');
    process.exit(1);
  }

  console.time('time:fill-state');

  // Fill state for blocks in the given range
  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    console.time(`time:fill-state-${blockNumber}`);

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

    // Create initial state for contracts
    assert(indexer.createInit);
    await indexer.createInit(blockHash, blockNumber);

    // Fill state for each contract in contractEntitiesMap
    const contractStatePromises = Array.from(contractEntitiesMap.entries())
      .map(async ([contractAddress, entities]): Promise<void> => {
        // Get all the updated entities at this block
        const updatedEntitiesListPromises = entities.map(async (entity): Promise<any[]> => {
          return indexer.getEntitiesForBlock(blockHash, entity);
        });
        const updatedEntitiesList = await Promise.all(updatedEntitiesListPromises);

        // Populate state with all the updated entities of each entity type
        updatedEntitiesList.forEach((updatedEntities, index) => {
          const entityName = entities[index];

          updatedEntities.forEach((updatedEntity) => {
            assert(indexer.getRelationsMap);
            assert(indexer.updateSubgraphState);

            // Prepare diff data for the entity update
            const diffData = prepareEntityState(updatedEntity, entityName, indexer.getRelationsMap());

            // Update the in-memory subgraph state
            indexer.updateSubgraphState(contractAddress, diffData);
          });
        });
      });

    await Promise.all(contractStatePromises);

    // Persist subgraph state to the DB
    assert(indexer.dumpSubgraphState);
    await indexer.dumpSubgraphState(blockHash, true);
    await indexer.updateStateSyncStatusIndexedBlock(blockNumber);

    // Create checkpoints
    await indexer.processCheckpoint(blockHash);
    await indexer.updateStateSyncStatusCheckpointBlock(blockNumber);

    console.timeEnd(`time:fill-state-${blockNumber}`);
  }

  console.timeEnd('time:fill-state');
};
