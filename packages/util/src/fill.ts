//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';

import { JobQueue } from './job-queue';
import { EventWatcherInterface, IndexerInterface } from './types';
import { wait } from './misc';
import { processBlockByNumberWithCache } from './common';

const log = debug('vulcanize:fill');

const DEFAULT_PREFETCH_BATCH_SIZE = 10;

export const fillBlocks = async (
  jobQueue: JobQueue,
  indexer: IndexerInterface,
  eventWatcher: EventWatcherInterface,
  blockDelayInMilliSecs: number,
  argv: {
    startBlock: number,
    endBlock: number,
    prefetch?: boolean,
    batchBlocks?: number,
  }
): Promise<any> => {
  let { startBlock, endBlock, prefetch = false, batchBlocks = DEFAULT_PREFETCH_BATCH_SIZE } = argv;

  if (startBlock > endBlock) {
    throw new Error(`endBlock ${endBlock} should be greater than or equal to startBlock ${startBlock}`);
  }

  const syncStatus = await indexer.getSyncStatus();

  if (prefetch) {
    if (syncStatus && startBlock <= syncStatus.chainHeadBlockNumber) {
      throw new Error(`startBlock should be greater than chain head ${syncStatus.chainHeadBlockNumber}`);
    }

    await prefetchBlocks(indexer, blockDelayInMilliSecs, { startBlock, endBlock, batchBlocks });
    return;
  }

  if (syncStatus) {
    if (startBlock > syncStatus.chainHeadBlockNumber + 1) {
      throw new Error(`Missing blocks between startBlock ${startBlock} and chainHeadBlockNumber ${syncStatus.chainHeadBlockNumber}`);
    }

    if (endBlock <= syncStatus.chainHeadBlockNumber) {
      throw new Error(`endBlock ${endBlock} should be greater than chainHeadBlockNumber ${syncStatus.chainHeadBlockNumber}`);
    }

    startBlock = syncStatus.chainHeadBlockNumber + 1;
  }

  await eventWatcher.initBlockProcessingOnCompleteHandler();
  await eventWatcher.initEventProcessingOnCompleteHandler();

  const numberOfBlocks = endBlock - startBlock + 1;

  processBlockByNumberWithCache(jobQueue, startBlock);

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
      const blocksProcessed = blockNumber - startBlock + 1;
      const completePercentage = Math.round(blocksProcessed / numberOfBlocks * 100);
      log(`Processed ${blocksProcessed} of ${numberOfBlocks} blocks (${completePercentage}%)`);

      await processBlockByNumberWithCache(jobQueue, blockNumber + 1);

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
      const { cid, blockHash, blockNumber, parentHash, timestamp } = block;
      const blockProgress = await indexer.getBlockProgress(blockHash);

      if (!blockProgress) {
        await indexer.saveBlockAndFetchEvents({ cid, blockHash, blockNumber, parentHash, blockTimestamp: timestamp });
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
