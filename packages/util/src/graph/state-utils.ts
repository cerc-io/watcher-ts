//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';
import { Between, ValueTransformer } from 'typeorm';

import { jsonBigIntStringReplacer } from '../misc';
import { IndexerInterface, StateInterface } from '../types';
import { GraphDatabase } from './database';
import { resolveEntityFieldConflicts } from './utils';

const log = debug('vulcanize:state-utils');

export const prepareEntityState = (updatedEntity: any, entityName: string, relationsMap: Map<any, { [key: string]: any }>): any => {
  // Resolve any field name conflicts in the dbData for auto-diff.
  updatedEntity = resolveEntityFieldConflicts(updatedEntity);

  // Prepare the diff data.
  const diffData: any = { state: {} };

  const result = Array.from(relationsMap.entries())
    .find(([key]) => key.name === entityName);

  if (result) {
    // Update entity data if relations exist.
    const [, relations] = result;

    // Update relation fields for diff data to be similar to GQL query entities.
    Object.entries(relations).forEach(([relation, { isArray, isDerived }]) => {
      if (isDerived || !updatedEntity[relation]) {
        // Field is not present in dbData for derived relations
        return;
      }

      if (isArray) {
        updatedEntity[relation] = updatedEntity[relation].map((id: string) => ({ id }));
      } else {
        updatedEntity[relation] = { id: updatedEntity[relation] };
      }
    });
  }

  // JSON stringify and parse data for handling unknown types when encoding.
  // For example, decimal.js values are converted to string in the diff data.
  diffData.state[entityName] = {
    // Using custom replacer to store bigints as string values to be encoded by IPLD dag-cbor.
    // TODO: Parse and store as native bigint by using Type encoders in IPLD dag-cbor encode.
    // https://github.com/rvagg/cborg#type-encoders
    [updatedEntity.id]: JSON.parse(JSON.stringify(updatedEntity, jsonBigIntStringReplacer))
  };

  return diffData;
};

export const prepareGQLEntityState = (entity: any, entityName: string, relationsMap: Map<any, { [key: string]: any }>): any => {
  // Prepare the diff data.
  const diffData: any = { state: {} };

  const result = Array.from(relationsMap.entries())
    .find(([key]) => key.name === entityName);

  if (result) {
    // Update entity data if relations exist.
    const [, relations] = result;

    // Update relation fields for diff data to be similar to GQL query entities.
    Object.entries(relations).forEach(([relation, { isArray, isDerived }]) => {
      if (isDerived || !entity[relation]) {
        // Field is not present in dbData for derived relations
        return;
      }

      if (isArray) {
        entity[relation] = entity[relation].map(({ id }: { id: string }) => ({ id }));
      } else {
        entity[relation] = { id: entity[relation].id };
      }
    });
  }

  // Remove typename field included in GQL response
  delete entity.__typename;

  diffData.state[entityName] = {
    [entity.id]: entity
  };

  return diffData;
};

export const updateEntitiesFromState = async (database: GraphDatabase, indexer: IndexerInterface, state: StateInterface): Promise<void> => {
  const data = indexer.getStateData(state);

  // Get relations for subgraph entity
  assert(indexer.getRelationsMap);
  const relationsMap = indexer.getRelationsMap();

  for (const [entityName, entities] of Object.entries(data.state)) {
    const result = Array.from(relationsMap.entries())
      .find(([key]) => key.name === entityName);

    const relations = result ? result[1] : {};

    log(`Updating entities from State for entity ${entityName}`);
    console.time(`time:watcher#GraphWatcher-updateEntitiesFromState-update-entity-${entityName}`);
    for (const [, entityData] of Object.entries(entities as any)) {
      const dbData = database.fromState(state.block, entityName, entityData, relations);
      await database.saveEntity(entityName, dbData);
    }
    console.timeEnd(`time:watcher#GraphWatcher-updateEntitiesFromState-update-entity-${entityName}`);
  }
};

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

export const fromStateEntityValues = (
  stateEntity: any,
  propertyName: string,
  relations: { [key: string]: any } = {},
  transformer?: ValueTransformer | ValueTransformer[]
): any => {
  // Parse DB data value from state entity data.
  if (relations) {
    const relation = relations[propertyName];

    if (relation) {
      if (relation.isArray) {
        return stateEntity[propertyName].map((relatedEntity: { id: string }) => relatedEntity.id);
      } else {
        return stateEntity[propertyName]?.id;
      }
    }
  }

  if (transformer) {
    if (Array.isArray(transformer)) {
      // Apply transformer in reverse order similar to when reading from DB.
      return transformer.reduceRight((acc, elTransformer) => {
        return elTransformer.from(acc);
      }, stateEntity[propertyName]);
    }

    return transformer.from(stateEntity[propertyName]);
  }

  return stateEntity[propertyName];
};
