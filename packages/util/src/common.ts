import debug from 'debug';
import assert from 'assert';
import { DeepPartial } from 'typeorm';
import { errors } from 'ethers';
import JSONbig from 'json-bigint';

import {
  QUEUE_BLOCK_PROCESSING,
  QUEUE_HOOKS,
  QUEUE_BLOCK_CHECKPOINT,
  JOB_KIND_PRUNE,
  JOB_KIND_INDEX,
  UNKNOWN_EVENT_NAME
} from './constants';
import { JobQueue } from './job-queue';
import { BlockProgressInterface, IndexerInterface, EventInterface } from './types';
import { wait } from './misc';
import { OrderDirection } from './database';
import { JobQueueConfig } from './config';

const DEFAULT_EVENTS_IN_BATCH = 50;

const log = debug('vulcanize:common');
const JSONbigNative = JSONbig({ useNativeBigInt: true });

export interface PrefetchedBlock {
  block: BlockProgressInterface;
  events: DeepPartial<EventInterface>[];
}

/**
 * Create a processing job in QUEUE_BLOCK_PROCESSING.
 * @param jobQueue
 * @param blockNumber
 */
export const processBlockByNumber = async (
  jobQueue: JobQueue,
  blockNumber: number
): Promise<void> => {
  log(`Process block ${blockNumber}`);

  // TODO Check syncStatus if blockNumber already processed (might cause problems on restart).

  await jobQueue.pushJob(
    QUEUE_BLOCK_PROCESSING,
    {
      kind: JOB_KIND_INDEX,
      blockNumber
    }
  );
};

/**
 * Method to fetch all blocks at a height.
 * @param job
 * @param indexer
 * @param jobQueueConfig
 * @param blockAndEventsMap
 */
export const fetchBlocksAtHeight = async (
  blockNumber: number,
  indexer: IndexerInterface,
  jobQueueConfig: JobQueueConfig,
  blockAndEventsMap: Map<string, PrefetchedBlock>
): Promise<DeepPartial<BlockProgressInterface>[]> => {
  let blocks = [];

  // Check for blocks in cache if prefetchBlocksInMem flag set.
  if (jobQueueConfig.prefetchBlocksInMem) {
    // Get blocks prefetched in memory.
    blocks = getPrefetchedBlocksAtHeight(blockAndEventsMap, blockNumber);
    log('size:common#fetchBlocksAtHeight-prefetch-_blockAndEventsMap-size:', blockAndEventsMap.size);
  }

  if (!blocks.length) {
    // Try fetching blocks from the db.
    const blockProgressEntities = await indexer.getBlocksAtHeight(blockNumber, false);
    blocks = blockProgressEntities.map((block: any) => {
      block.timestamp = block.blockTimestamp;

      return block;
    });
  }

  if (jobQueueConfig.prefetchBlocksInMem && !blocks.length) {
    // If blocks not found in the db and cache, fetch next batch.
    log(`common#cache-miss-${blockNumber}`);

    // Wait for blocks to be prefetched.
    console.time('time:common#fetchBlocks-_prefetchBlocks');
    await _prefetchBlocks(blockNumber, indexer, jobQueueConfig, blockAndEventsMap);
    console.timeEnd('time:common#fetchBlocks-_prefetchBlocks');

    blocks = getPrefetchedBlocksAtHeight(blockAndEventsMap, blockNumber);
  }

  // Try fetching blocks from eth-server until found.
  while (!blocks.length) {
    try {
      console.time('time:common#_fetchBlocks-eth-server');
      blocks = await indexer.getBlocks({ blockNumber });

      if (!blocks.length) {
        log(`No blocks fetched for block number ${blockNumber}, retrying after ${jobQueueConfig.blockDelayInMilliSecs} ms delay.`);
        await wait(jobQueueConfig.blockDelayInMilliSecs);
      }
    } catch (err: any) {
      // Handle null block error in case of Lotus EVM
      if (!(err.code === errors.SERVER_ERROR && err.error && err.error.message === 'requested epoch was a null round')) {
        throw err;
      }

      log(`Block ${blockNumber} requested was null (FEVM); Fetching next block`);
      blockNumber++;
    } finally {
      console.timeEnd('time:common#_fetchBlocks-eth-server');
    }
  }

  assert(blocks.length, 'Blocks not fetched');

  const blocksToBeIndexed: DeepPartial<BlockProgressInterface>[] = [];
  for (const block of blocks) {
    const { cid, blockHash, blockNumber, parentHash, timestamp } = block;

    blocksToBeIndexed.push({
      blockNumber: Number(blockNumber),
      cid,
      blockHash,
      parentHash,
      blockTimestamp: timestamp
    });
  }

  await indexer.updateSyncStatusChainHead(blocks[0].blockHash, blocks[0].blockNumber);

  return blocksToBeIndexed;
};

export const _prefetchBlocks = async (
  blockNumber: number,
  indexer: IndexerInterface,
  jobQueueConfig: JobQueueConfig,
  blockAndEventsMap: Map<string, PrefetchedBlock>
): Promise<void> => {
  // Clear cache of any remaining blocks.
  blockAndEventsMap.clear();

  const blocksWithEvents = await _fetchBatchBlocks(
    indexer,
    jobQueueConfig,
    blockNumber,
    blockNumber + jobQueueConfig.prefetchBlockCount
  );

  blocksWithEvents.forEach(({ blockProgress, events }) => {
    blockAndEventsMap.set(blockProgress.blockHash, { block: blockProgress, events });
  });
};

/**
 * Method to fetch blocks (with events) in the given range.
 * @param indexer
 * @param jobQueueConfig
 * @param startBlock
 * @param endBlock
 */
export const _fetchBatchBlocks = async (
  indexer: IndexerInterface,
  jobQueueConfig: JobQueueConfig,
  startBlock: number,
  endBlock: number
): Promise<{
  blockProgress: BlockProgressInterface,
  events: DeepPartial<EventInterface>[]
}[]> => {
  let blockNumbers = [...Array(endBlock - startBlock).keys()].map(n => n + startBlock);
  let blocks = [];

  // Fetch blocks again if there are missing blocks.
  while (true) {
    console.time('time:common#fetchBatchBlocks-getBlocks');

    const blockPromises = blockNumbers.map(async blockNumber => indexer.getBlocks({ blockNumber }));
    const settledResults = await Promise.allSettled(blockPromises);

    const res: any[] = [];
    for (let index = 0; index < settledResults.length; index++) {
      const result = settledResults[index];
      // If fulfilled, return value
      if (result.status === 'fulfilled') {
        res.push(result.value);
        continue;
      }

      // If rejected, check error
      //  Handle null block error in case of Lotus EVM
      //  Otherwise, rethrow error
      const err = result.reason;
      if (!(err.code === errors.SERVER_ERROR && err.error && err.error.message === 'requested epoch was a null round')) {
        throw err;
      }

      log(`Block ${blockNumbers[index]} requested was null (FEVM), skipping`);

      // Remove the corresponding block number from the blockNumbers to avoid retrying for the same
      blockNumbers = blockNumbers.splice(index, 1);

      // Stop the iteration at the first null block found
      // To avoid saving blocks after the null block
      // so that they don't conflict with blocks fetched when processBlockByNumber gets called for the null block
      // TODO: Optimize
      break;
    }

    console.timeEnd('time:common#fetchBatchBlocks-getBlocks');

    const firstMissingBlockIndex = res.findIndex(blocks => blocks.length === 0);

    if (firstMissingBlockIndex === -1) {
      blocks = res;
      break;
    } else if (firstMissingBlockIndex > 0) {
      blocks = res.slice(0, firstMissingBlockIndex);
      break;
    }

    log(`No blocks fetched for block number ${blockNumbers[0]}, retrying after ${jobQueueConfig.blockDelayInMilliSecs} ms delay.`);
    await wait(jobQueueConfig.blockDelayInMilliSecs);
  }

  // Flatten array as there can be multiple blocks at the same height
  blocks = blocks.flat();

  if (jobQueueConfig.jobDelayInMilliSecs) {
    await wait(jobQueueConfig.jobDelayInMilliSecs);
  }

  blocks.forEach(block => {
    block.blockTimestamp = block.timestamp;
    block.blockNumber = Number(block.blockNumber);
  });

  console.time('time:common#fetchBatchBlocks-fetchEventsAndSaveBlocks');
  const blockAndEventsList = await indexer.fetchEventsAndSaveBlocks(blocks);
  console.timeEnd('time:common#fetchBatchBlocks-fetchEventsAndSaveBlocks');

  return blockAndEventsList;
};

/**
 * Process events in batches for a block.
 * @param indexer
 * @param block
 * @param eventsInBatch
 */
export const processBatchEvents = async (indexer: IndexerInterface, block: BlockProgressInterface, eventsInBatch: number): Promise<void> => {
  let page = 0;

  // Check if block processing is complete.
  while (block.numProcessedEvents < block.numEvents) {
    console.time('time:common#processBacthEvents-fetching_events_batch');

    // Fetch events in batches
    const events = await indexer.getBlockEvents(
      block.blockHash,
      {},
      {
        skip: (page++) * (eventsInBatch || DEFAULT_EVENTS_IN_BATCH),
        limit: eventsInBatch || DEFAULT_EVENTS_IN_BATCH,
        orderBy: 'index',
        orderDirection: OrderDirection.asc
      }
    );

    console.timeEnd('time:common#processBacthEvents-fetching_events_batch');

    if (events.length) {
      log(`Processing events batch from index ${events[0].index} to ${events[0].index + events.length - 1}`);
    }

    console.time('time:common#processBatchEvents-processing_events_batch');

    // Process events in loop
    for (let event of events) {
      // Skipping check for order of events processing since logIndex in FEVM is not index of log in block
      // Check was introduced to avoid reprocessing block events incase of restarts. But currently on restarts, unprocessed block is removed and reprocessed from first event log
      // if (event.index <= block.lastProcessedEventIndex) {
      //   throw new Error(`Events received out of order for block number ${block.blockNumber} hash ${block.blockHash}, got event index ${eventIndex} and lastProcessedEventIndex ${block.lastProcessedEventIndex}, aborting`);
      // }

      const watchedContract = indexer.isWatchedContract(event.contract);

      if (watchedContract) {
        // We might not have parsed this event yet. This can happen if the contract was added
        // as a result of a previous event in the same block.
        if (event.eventName === UNKNOWN_EVENT_NAME) {
          const logObj = JSON.parse(event.extraInfo);

          assert(indexer.parseEventNameAndArgs);
          assert(typeof watchedContract !== 'boolean');
          const { eventName, eventInfo, eventSignature } = indexer.parseEventNameAndArgs(watchedContract.kind, logObj);

          event.eventName = eventName;
          event.eventInfo = JSONbigNative.stringify(eventInfo);
          event.extraInfo = JSONbigNative.stringify({
            ...logObj,
            eventSignature
          });
          event = await indexer.saveEventEntity(event);
        }

        await indexer.processEvent(event);
      }

      block = await indexer.updateBlockProgress(block, event.index);
    }

    console.timeEnd('time:common#processBatchEvents-processing_events_batch');
  }

  if (indexer.processBlockAfterEvents) {
    if (!block.isComplete) {
      await indexer.processBlockAfterEvents(block.blockHash, block.blockNumber);
    }
  }

  block.isComplete = true;
  console.time('time:common#processBatchEvents-updateBlockProgress');
  await indexer.updateBlockProgress(block, block.lastProcessedEventIndex);
  console.timeEnd('time:common#processBatchEvents-updateBlockProgress');
};

/**
 * Create pruning job in QUEUE_BLOCK_PROCESSING.
 * @param jobQueue
 * @param latestCanonicalBlockNumber
 * @param priority
 */
export const createPruningJob = async (jobQueue: JobQueue, latestCanonicalBlockNumber: number, priority = 0): Promise<void> => {
  const pruneBlockHeight = latestCanonicalBlockNumber + 1;
  const newPriority = priority + 1;

  // Create a job to prune at block height (latestCanonicalBlockNumber + 1).
  return jobQueue.pushJob(
    QUEUE_BLOCK_PROCESSING,
    {
      kind: JOB_KIND_PRUNE,
      pruneBlockHeight,
      priority: newPriority
    },
    {
      priority: newPriority
    }
  );
};

/**
 * Create a job in QUEUE_HOOKS.
 * @param jobQueue
 * @param blockHash
 * @param blockNumber
 */
export const createHooksJob = async (jobQueue: JobQueue, blockHash: string, blockNumber: number): Promise<void> => {
  await jobQueue.pushJob(
    QUEUE_HOOKS,
    {
      blockHash,
      blockNumber
    }
  );
};

/**
 * Create a job in QUEUE_BLOCK_CHECKPOINT.
 * @param jobQueue
 * @param blockHash
 * @param blockNumber
 */
export const createCheckpointJob = async (jobQueue: JobQueue, blockHash: string, blockNumber: number): Promise<void> => {
  await jobQueue.pushJob(
    QUEUE_BLOCK_CHECKPOINT,
    {
      blockHash,
      blockNumber
    }
  );
};

const getPrefetchedBlocksAtHeight = (blockAndEventsMap: Map<string, PrefetchedBlock>, blockNumber: number):any[] => {
  return Array.from(blockAndEventsMap.values())
    .filter(({ block }) => Number(block.blockNumber) === blockNumber)
    .map(prefetchedBlock => prefetchedBlock.block);
};
