//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { JobQueue } from './job-queue';
import { EventWatcherInterface, IndexerInterface } from './types';
import { processBlockByNumber } from './common';

export const fillBlocks = async (
  jobQueue: JobQueue,
  indexer: IndexerInterface,
  ethClient: EthClient,
  eventWatcher: EventWatcherInterface,
  blockDelayInMilliSecs: number,
  { startBlock, endBlock }: { startBlock: number, endBlock: number}
): Promise<any> => {
  assert(startBlock < endBlock, 'endBlock should be greater than startBlock');

  await eventWatcher.initBlockProcessingOnCompleteHandler();
  await eventWatcher.initEventProcessingOnCompleteHandler();

  let currentBlockNumber = startBlock;
  const syncStatus = await indexer.getSyncStatus();

  if (syncStatus) {
    if (currentBlockNumber > syncStatus.latestIndexedBlockNumber + 1) {
      throw new Error(`Missing blocks between startBlock ${currentBlockNumber} and latestIndexedBlockNumber ${syncStatus.latestIndexedBlockNumber}`);
    }

    currentBlockNumber = syncStatus.latestIndexedBlockNumber + 1;
  }

  processBlockByNumber(jobQueue, indexer, ethClient, blockDelayInMilliSecs, currentBlockNumber);

  // Creating an AsyncIterable from AsyncIterator to iterate over the values.
  // https://www.codementor.io/@tiagolopesferreira/asynchronous-iterators-in-javascript-jl1yg8la1#for-wait-of
  const blockProgressEventIterable = {
    // getBlockProgressEventIterator returns an AsyncIterator which can be used to listen to BlockProgress events.
    [Symbol.asyncIterator]: eventWatcher.getBlockProgressEventIterator.bind(eventWatcher)
  };

  // Iterate over async iterable.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of
  for await (const data of blockProgressEventIterable) {
    const { onBlockProgressEvent: { blockNumber, isComplete } } = data;

    if (blockNumber === currentBlockNumber && isComplete) {
      if (blockNumber >= endBlock) {
        // Break the async loop when blockProgress event is for the endBlock and processing is complete.
        break;
      }

      currentBlockNumber++;
      processBlockByNumber(jobQueue, indexer, ethClient, blockDelayInMilliSecs, currentBlockNumber);
    }
  }
};
