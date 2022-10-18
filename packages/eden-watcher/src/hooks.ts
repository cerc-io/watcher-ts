//
// Copyright 2021 Vulcanize, Inc.
//

import { StateInterface, StateKind } from '@cerc-io/util';
import assert from 'assert';
import * as codec from '@ipld/dag-cbor';
import _ from 'lodash';

import { Indexer, ResultEvent } from './indexer';

const STATE_BATCH_SIZE = 10000;

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

  // Store an empty State.
  const stateData: any = {
    state: {}
  };

  // Return initial state data to be saved.
  return stateData;
}

/**
 * Hook function to create state diff.
 * @param indexer Indexer instance that contains methods to fetch the contract varaiable values.
 * @param blockHash Block hash of the concerned block.
 */
export async function createStateDiff (indexer: Indexer, blockHash: string): Promise<void> {
  assert(indexer);
  assert(blockHash);

  // Use indexer.createDiff() method to save custom state diff(s).
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
  let prevNonDiffBlock: StateInterface;
  let diffStartBlockNumber: number;
  const checkpointBlock = await indexer.getLatestState(contractAddress, StateKind.Checkpoint, block.blockNumber - 1);

  if (checkpointBlock) {
    const checkpointBlockNumber = checkpointBlock.block.blockNumber;

    prevNonDiffBlock = checkpointBlock;
    diffStartBlockNumber = checkpointBlockNumber;

    // Update State status map with the latest checkpoint info.
    // Essential while importing state as checkpoint at the snapshot block is added by import-state CLI.
    // (job-runner won't have the updated State status)
    indexer.updateStateStatusMap(contractAddress, { checkpoint: checkpointBlockNumber });
  } else {
    // There should be an initial state at least.
    const initBlock = await indexer.getLatestState(contractAddress, StateKind.Init);
    assert(initBlock, 'No initial state found');

    prevNonDiffBlock = initBlock;
    // Take block number previous to initial state block to include any diff state at that block.
    diffStartBlockNumber = initBlock.block.blockNumber - 1;
  }

  const prevNonDiffBlockData = codec.decode(Buffer.from(prevNonDiffBlock.data)) as any;
  const data = {
    state: prevNonDiffBlockData.state
  };

  console.time('time:hooks#createStateCheckpoint');

  // Fetching and merging all diff blocks after the latest 'checkpoint' | 'init' in batch.
  for (let i = diffStartBlockNumber; i < block.blockNumber;) {
    const endBlockHeight = Math.min(i + STATE_BATCH_SIZE, block.blockNumber);
    console.time(`time:hooks#createStateCheckpoint-batch-merge-diff-${i}-${endBlockHeight}`);
    const diffBlocks = await indexer.getDiffStatesInRange(contractAddress, i, endBlockHeight);

    // Merge all diff blocks after previous checkpoint.
    for (const diffBlock of diffBlocks) {
      const diff = codec.decode(Buffer.from(diffBlock.data)) as any;
      data.state = _.merge(data.state, diff.state);
    }

    console.timeEnd(`time:hooks#createStateCheckpoint-batch-merge-diff-${i}-${endBlockHeight}`);
    i = endBlockHeight;
  }

  console.time('time:hooks#createStateCheckpoint-db-save-checkpoint');
  await indexer.createStateCheckpoint(contractAddress, blockHash, data);
  console.timeEnd('time:hooks#createStateCheckpoint-db-save-checkpoint');

  console.timeEnd('time:hooks#createStateCheckpoint');
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
