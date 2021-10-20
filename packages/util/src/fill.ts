//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import assert from 'assert';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { JobQueue } from './job-queue';
import { JOB_KIND_INDEX, QUEUE_BLOCK_PROCESSING } from './constants';
import { EventWatcherInterface, IndexerInterface } from './types';

const log = debug('vulcanize:fill');

export const fillBlocks = async (
  jobQueue: JobQueue,
  indexer: IndexerInterface,
  ethClient: EthClient,
  eventWatcher: EventWatcherInterface,
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

  processBlockByNumber(jobQueue, indexer, ethClient, currentBlockNumber);

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
      processBlockByNumber(jobQueue, indexer, ethClient, currentBlockNumber);
    }
  }
};

/**
 * Method to fetch block by number and push to job queue.
 * @param jobQueue
 * @param indexer
 * @param ethClient
 * @param blockNumber
 */
const processBlockByNumber = async (
  jobQueue: JobQueue,
  indexer: IndexerInterface,
  ethClient: EthClient,
  blockNumber: number
) => {
  log(`Fill block ${blockNumber}`);

  const result = await ethClient.getBlocksByNumber(blockNumber);
  const { allEthHeaderCids: { nodes: blockNodes } } = result;

  for (let bi = 0; bi < blockNodes.length; bi++) {
    const { blockHash, blockNumber, parentHash, timestamp } = blockNodes[bi];
    const blockProgress = await indexer.getBlockProgress(blockHash);

    if (blockProgress) {
      log(`Block number ${blockNumber}, block hash ${blockHash} already known, skip filling`);
    } else {
      await indexer.updateSyncStatusChainHead(blockHash, blockNumber);

      await jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { kind: JOB_KIND_INDEX, blockHash, blockNumber, parentHash, timestamp });
    }
  }
};
