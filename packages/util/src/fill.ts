//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';

import { JobQueue } from './job-queue';
import { EventWatcherInterface, IndexerInterface } from './types';
import { wait } from './misc';
import { processBlockByNumber } from './common';

const log = debug('vulcanize:fill');

export const fillBlocks = async (
  jobQueue: JobQueue,
  indexer: IndexerInterface,
  eventWatcher: EventWatcherInterface,
  blockDelayInMilliSecs: number,
  argv: {
    startBlock: number,
    endBlock: number,
    prefetch: boolean,
    batchBlocks: number,
  }
): Promise<any> => {
  let { startBlock, endBlock, prefetch, batchBlocks } = argv;
  assert(startBlock < endBlock, 'endBlock should be greater than startBlock');

  const syncStatus = await indexer.getSyncStatus();

  if (syncStatus) {
    if (startBlock > syncStatus.chainHeadBlockNumber + 1) {
      throw new Error(`Missing blocks between startBlock ${startBlock} and chainHeadBlockNumber ${syncStatus.chainHeadBlockNumber}`);
    }

    startBlock = syncStatus.chainHeadBlockNumber + 1;
  }

  if (prefetch) {
    await prefetchBlocks(indexer, blockDelayInMilliSecs, { startBlock, endBlock, batchBlocks });
    return;
  }

  await eventWatcher.initBlockProcessingOnCompleteHandler();
  await eventWatcher.initEventProcessingOnCompleteHandler();

  const numberOfBlocks = endBlock - startBlock + 1;
  console.time(`time:fill#fillBlocks-process_block_${startBlock}`);

  processBlockByNumber(jobQueue, indexer, blockDelayInMilliSecs, startBlock);

  // Creating an AsyncIterable from AsyncIterator to iterate over the values.
  // https://www.codementor.io/@tiagolopesferreira/asynchronous-iterators-in-javascript-jl1yg8la1#for-wait-of
  const blockProgressEventIterable = {
    // getBlockProgressEventIterator returns an AsyncIterator which can be used to listen to BlockProgress events.
    [Symbol.asyncIterator]: eventWatcher.getBlockProgressEventIterator.bind(eventWatcher)
  };

  console.time('time:fill#fillBlocks-process_blocks');

  // Iterate over async iterable.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of
  for await (const data of blockProgressEventIterable) {
    const { onBlockProgressEvent: { blockNumber, isComplete } } = data;

    if (isComplete) {
      console.timeEnd(`time:fill#fillBlocks-process_block_${blockNumber}`);

      console.time(`time:fill#fillBlocks-process_block_${blockNumber + 1}`);

      const blocksProcessed = blockNumber - startBlock + 1;
      const completePercentage = Math.round(blocksProcessed / numberOfBlocks * 100);
      log(`Processed ${blocksProcessed} of ${numberOfBlocks} blocks (${completePercentage}%)`);

      await processBlockByNumber(jobQueue, indexer, blockDelayInMilliSecs, blockNumber + 1);

      if (blockNumber + 1 >= endBlock) {
        // Break the async loop when blockProgress event is for the endBlock and processing is complete.
        break;
      }
    }
  }

  log('Processed all blocks (100%)');
  console.timeEnd('time:fill#fillBlocks-process_blocks');
};

const prefetchBlocks = async (
  indexer: IndexerInterface,
  blockDelayInMilliSecs: number,
  { startBlock, endBlock, batchBlocks }: {
    startBlock: number,
    endBlock: number,
    batchBlocks: number,
  }
) => {
  for (let i = startBlock; i <= endBlock; i = i + batchBlocks) {
    const batchEndBlock = Math.min(i + batchBlocks, endBlock + 1);
    let blockNumbers = [...Array(batchEndBlock - i).keys()].map(n => n + i);
    log('Fetching blockNumbers:', blockNumbers);

    let blocks = [];

    // Fetch blocks again if there are missing blocks.
    while (true) {
      const blockPromises = blockNumbers.map(async blockNumber => indexer.getBlocks({ blockNumber }));
      const res = await Promise.all(blockPromises);

      const missingIndex = res.findIndex(blocks => blocks.length === 0);

      if (missingIndex < 0) {
        blocks = res.flat();
        break;
      }

      blockNumbers = blockNumbers.slice(missingIndex);
      await wait(blockDelayInMilliSecs);
    }

    const fetchBlockPromises = blocks.map(async block => {
      const { blockHash, blockNumber, parentHash, timestamp } = block;
      const blockProgress = await indexer.getBlockProgress(blockHash);

      if (!blockProgress) {
        await indexer.fetchBlockEvents({ blockHash, blockNumber, parentHash, blockTimestamp: timestamp });
      }
    });

    try {
      await Promise.all(fetchBlockPromises);
    } catch (error: any) {
      log(error.message);
      log('Exiting as upstream block not available for prefetch');
      process.exit(0);
    }
  }
};
