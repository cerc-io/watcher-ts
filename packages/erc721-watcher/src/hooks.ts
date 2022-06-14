//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';

import { updateStateForMappingType, updateStateForElementaryType } from '@vulcanize/util';

import { Indexer, ResultEvent } from './indexer';
import { TransferCount } from './entity/TransferCount';

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
    case 'TransferEvent': {
      // Get event fields from eventData.
      const { from, to, tokenId } = eventData.event;

      // Update balance entry for the sender in database.
      if (from !== '0x0000000000000000000000000000000000000000') {
        await indexer._balances(eventData.block.hash, eventData.contract, from, true);
      }

      // Update balance entry for the receiver in database.
      if (to !== '0x0000000000000000000000000000000000000000') {
        await indexer._balances(eventData.block.hash, eventData.contract, to, true);
      }

      // Update owner for the tokenId in database.
      await indexer._owners(eventData.block.hash, eventData.contract, tokenId, true);

      // Code to update a custom state prop transferCount.
      // {
      //   "transferCount": "1"
      // }
      // Fetch transferCount entity from database.
      let transferCount = await indexer.transferCount(eventData.block.hash, eventData.contract);

      if (!transferCount) {
        transferCount = new TransferCount();
        transferCount.blockHash = eventData.block.hash;
        transferCount.blockNumber = eventData.block.number;
        transferCount.id = eventData.contract;
        transferCount.count = 0;
      }

      // Increment count on transfer event.
      transferCount.count++;

      // Update state for custom prop transferCount.
      const stateUpdate = updateStateForElementaryType({}, 'transferCount', String(transferCount.count));
      await indexer.createDiffStaged(eventData.contract, eventData.block.hash, stateUpdate);

      // Save transferCount to database.
      await indexer.saveOrUpdateTransferCount(transferCount);

      break;
    }
    case 'ApprovalEvent': {
      // Get event fields from eventData.
      const { tokenId } = eventData.event;

      // Update tokenApprovals for the tokenId in database.
      await indexer._tokenApprovals(eventData.block.hash, eventData.contract, tokenId, true);

      break;
    }
    case 'ApprovalForAllEvent': {
      // Get event fields from eventData.
      const { owner, operator } = eventData.event;

      // Update operatorApprovals for the tokenId in database.
      await indexer._operatorApprovals(eventData.block.hash, eventData.contract, owner, operator, true);

      break;
    }
  }
}
