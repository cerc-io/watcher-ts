//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';

import { Indexer, ResultEvent } from './indexer';

export async function createInitialCheckpoint (indexer: Indexer, contractAddress: string, blockHash: string): Promise<void> {
  assert(indexer);
  assert(blockHash);
  assert(contractAddress);

  // Store an empty state in an IPLDBlock.
  const ipldBlockData: any = {
    state: {}
  };

  await indexer.createCheckpoint(contractAddress, blockHash, ipldBlockData);
}

export async function createStateDiff (indexer: Indexer, blockHash: string): Promise<void> {
  assert(indexer);
  assert(blockHash);
}

export async function createStateCheckpoint (indexer: Indexer, contractAddress: string, blockHash: string): Promise<boolean> {
  assert(indexer);
  assert(blockHash);
  assert(contractAddress);

  return false;
}

export async function handleEvent (indexer: Indexer, eventData: ResultEvent): Promise<void> {
  assert(indexer);
  assert(eventData);
}
