//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';

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
  await eventWatcher.initBlockProcessingOnCompleteHandler();
  await eventWatcher.initEventProcessingOnCompleteHandler();

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    log(`Fill block ${blockNumber}`);

    // TODO: Add pause between requests so as to not overwhelm the upsteam server.
    const result = await ethClient.getBlockWithTransactions({ blockNumber });
    const { allEthHeaderCids: { nodes: blockNodes } } = result;
    for (let bi = 0; bi < blockNodes.length; bi++) {
      const { blockHash, blockNumber, parentHash, timestamp } = blockNodes[bi];
      const blockProgress = await indexer.getBlockProgress(blockHash);

      if (blockProgress) {
        log(`Block number ${blockNumber}, block hash ${blockHash} already known, skip filling`);
      } else {
        await jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { kind: JOB_KIND_INDEX, blockHash, blockNumber, parentHash, timestamp });
      }
    }
  }

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

    if (blockNumber >= endBlock && isComplete) {
      // Break the async loop if blockProgress event is for the endBlock and processing is complete.
      break;
    }
  }
};
