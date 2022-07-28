//
// Copyright 2021 Vulcanize, Inc.
//

import { IPLDBlockInterface, StateKind } from '@vulcanize/util';
import assert from 'assert';
import * as codec from '@ipld/dag-cbor';
import _ from 'lodash';

import { Indexer, ResultEvent } from './indexer';

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

  // Store an empty state in an IPLDBlock.
  const ipldBlockData: any = {
    state: {}
  };

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

  // Use indexer.createStateDiff() method to create a custom diff.
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

  // TODO: Pass blockProgress instead of blockHash to hook method.
  const block = await indexer.getBlockProgress(blockHash);
  assert(block);

  // Fetch the latest 'checkpoint' | 'init' for the contract to fetch diffs after it.
  let prevNonDiffBlock: IPLDBlockInterface;
  let getDiffBlockNumber: number;
  const checkpointBlock = await indexer.getLatestIPLDBlock(contractAddress, StateKind.Checkpoint, block.blockNumber);

  if (checkpointBlock) {
    const checkpointBlockNumber = checkpointBlock.block.blockNumber;

    prevNonDiffBlock = checkpointBlock;
    getDiffBlockNumber = checkpointBlockNumber;

    // Update IPLD status map with the latest checkpoint info.
    // Essential while importing state as checkpoint at the snapshot block is added by import-state CLI.
    // (job-runner won't have the updated ipld status)
    indexer.updateIPLDStatusMap(contractAddress, { checkpoint: checkpointBlockNumber });
  } else {
    // There should be an initial state at least.
    const initBlock = await indexer.getLatestIPLDBlock(contractAddress, StateKind.Init);
    assert(initBlock, 'No initial state found');

    prevNonDiffBlock = initBlock;
    // Take block number previous to initial state block to include any diff state at that block.
    getDiffBlockNumber = initBlock.block.blockNumber - 1;
  }

  // Fetching all diff blocks after the latest 'checkpoint' | 'init'.
  const diffBlocks = await indexer.getDiffIPLDBlocksByBlocknumber(contractAddress, getDiffBlockNumber);

  const prevNonDiffBlockData = codec.decode(Buffer.from(prevNonDiffBlock.data)) as any;
  const data = {
    state: prevNonDiffBlockData.state
  };

  // Merge all diff blocks after previous checkpoint.
  for (const diffBlock of diffBlocks) {
    const diff = codec.decode(Buffer.from(diffBlock.data)) as any;
    data.state = _.merge(data.state, diff.state);
  }

  // Check if Block entity exists.
  if (data.state.Block) {
    // Store only block entity at checkpoint height instead of all entities.
    data.state.Block = {
      [blockHash]: data.state.Block[blockHash]
    };
  }

  await indexer.createStateCheckpoint(contractAddress, blockHash, data);

  return true;
}

/**
 * Event hook function.
 * @param indexer Indexer instance that contains methods to fetch and update the contract values in the database.
 * @param eventData ResultEvent object containing event information.
 */
export async function handleEvent (indexer: Indexer, eventData: ResultEvent): Promise<void> {
  assert(indexer);
  assert(eventData);
}
