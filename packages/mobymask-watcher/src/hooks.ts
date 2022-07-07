//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { utils } from 'ethers';

// import { updateStateForMappingType, updateStateForElementaryType } from '@vulcanize/util';

import { Indexer, KIND_PHISHERREGISTRY, ResultEvent } from './indexer';

/**
 * Hook function to store an initial state.
 * @param indexer Indexer instance.
 * @param blockHash Hash of the concerned block.
 * @param contractAddress Address of the concerned contract.
 * @returns Data block to be stored.
 */
export async function createInitialState (indexer: Indexer, contractAddress: string, blockHash: string): Promise<any> {
  assert(indexer);
  assert(blockHash);
  assert(contractAddress);

  // Store the desired initial state in an IPLDBlock.
  const ipldBlockData: any = {
    state: {}
  };

  // Use updateStateForElementaryType to update initial state with an elementary property.
  // Eg. const ipldBlockData = updateStateForElementaryType(ipldBlockData, '_totalBalance', result.value.toString());

  // Use updateStateForMappingType to update initial state with a nested property.
  // Eg. const ipldBlockData = updateStateForMappingType(ipldBlockData, '_allowances', [owner, spender], allowance.value.toString());

  // Return initial state data to be saved.
  return ipldBlockData;
}

/**
 * Hook function to create state diff.
 * @param indexer Indexer instance that contains methods to fetch the contract varaiable values.
 * @param blockHash Block hash of the concerned block.
 */
export async function createStateDiff (indexer: Indexer, blockHash: string): Promise<void> {
  assert(indexer);
  assert(blockHash);

  // Use indexer.createStateDiff() method to save custom state diff(s).
}

/**
 * Hook function to create state checkpoint
 * @param indexer Indexer instance.
 * @param contractAddress Address of the concerned contract.
 * @param blockHash Block hash of the concerned block.
 * @returns Whether to disable default checkpoint. If false, the state from this hook is updated with that from default checkpoint.
 */
export async function createStateCheckpoint (indexer: Indexer, contractAddress: string, blockHash: string): Promise<boolean> {
  assert(indexer);
  assert(blockHash);
  assert(contractAddress);

  // Use indexer.createStateCheckpoint() method to create a custom checkpoint.

  // Return false to update the state created by this hook by auto-generated checkpoint state.
  // Return true to disable update of the state created by this hook by auto-generated checkpoint state.
  return false;
}

/**
 * Event hook function.
 * @param indexer Indexer instance that contains methods to fetch and update the contract values in the database.
 * @param eventData ResultEvent object containing event information.
 */
export async function handleEvent (indexer: Indexer, eventData: ResultEvent): Promise<void> {
  assert(indexer);
  assert(eventData);

  // Perform indexing based on the type of event.
  switch (eventData.event.__typename) {
    // In case of PhisherRegistry 'PhisherStatusUpdated' event.
    case 'PhisherStatusUpdatedEvent': {
      const txArgs = await getTxArgs(indexer, KIND_PHISHERREGISTRY, eventData.tx.hash);

      // Update isPhisher entry for the identifier in database.
      await indexer.isPhisher(eventData.block.hash, eventData.contract, txArgs.identifier, true);

      break;
    }
    // In case of PhisherRegistry 'MemberStatusUpdated' event.
    case 'MemberStatusUpdatedEvent': {
      const txArgs = await getTxArgs(indexer, KIND_PHISHERREGISTRY, eventData.tx.hash);

      // Update isPhisher entry for the identifier in database.
      await indexer.isMember(eventData.block.hash, eventData.contract, txArgs.identifier, true);

      break;
    }
  }
}

// Get transaction arguments for specified txHash.
const getTxArgs = async (indexer: Indexer, contractKind: string, txHash: string): Promise<utils.Result> => {
  const tx = await indexer.getFullTransaction(txHash);
  const contractInterface = await indexer.getContractInterface(contractKind);
  assert(contractInterface);
  const txDescription = contractInterface.parseTransaction({ data: tx.input });
  return txDescription.args;
};
