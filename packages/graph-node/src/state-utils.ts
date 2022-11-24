//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';
import _ from 'lodash';

import { IndexerInterface } from '@cerc-io/util';

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
