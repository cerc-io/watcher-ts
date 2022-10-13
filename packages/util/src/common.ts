import debug from 'debug';
import assert from 'assert';
import { DeepPartial } from 'typeorm';

import { QUEUE_BLOCK_PROCESSING, JOB_KIND_PRUNE, JOB_KIND_INDEX, UNKNOWN_EVENT_NAME } from './constants';
import { JobQueue } from './job-queue';
import { BlockProgressInterface, IndexerInterface, EventInterface } from './types';
import { wait } from './misc';
import { OrderDirection } from './database';
import { JobQueueConfig } from './config';

const DEFAULT_EVENTS_IN_BATCH = 50;

const log = debug('vulcanize:common');

export interface PrefetchedBlock {
  block: any;
  events: DeepPartial<EventInterface>[];
}

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
 * Create fetch-blocks job in QUEUE_BLOCK_PROCESSING.
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

export const fetchBlocks = async (
  job: any,
  indexer: IndexerInterface,
  jobQueueConfig: JobQueueConfig,
  prefetchedBlocksMap: Map<string, PrefetchedBlock>
): Promise<DeepPartial<BlockProgressInterface>[]> => {
  const { blockNumber } = job.data;
  let blocks = [];

  // Check for blocks in cache if prefetchBlocksInMem flag set.
  if (jobQueueConfig.prefetchBlocksInMem) {
    // Wait for further blocks to be prefetched.
    console.time('time:common#fetchBlocks-_prefetchBlocks');
    await _prefetchBlocks(blockNumber, indexer, jobQueueConfig, prefetchedBlocksMap);
    console.timeEnd('time:common#fetchBlocks-_prefetchBlocks');

    log('size:common#_fetchBlocks-_prefetchedBlocksMap-size:', prefetchedBlocksMap.size);

    // Get blocks prefetched in memory.
    blocks = Array.from(prefetchedBlocksMap.values())
      .filter(({ block }) => Number(block.blockNumber) === blockNumber)
      .map(prefetchedBlock => prefetchedBlock.block);
  }

  if (!blocks.length) {
    log(`common#cache-miss-${blockNumber}`);
    const blockProgressEntities = await indexer.getBlocksAtHeight(blockNumber, false);

    blocks = blockProgressEntities.map((block: any) => {
      block.timestamp = block.blockTimestamp;

      return block;
    });
  }

  // Try fetching blocks from eth-server until found.
  while (!blocks.length) {
    console.time('time:common#_fetchBlocks-eth-server');
    blocks = await indexer.getBlocks({ blockNumber });
    console.timeEnd('time:common#_fetchBlocks-eth-server');

    if (!blocks.length) {
      log(`No blocks fetched for block number ${blockNumber}, retrying after ${jobQueueConfig.blockDelayInMilliSecs} ms delay.`);
      await wait(jobQueueConfig.blockDelayInMilliSecs);
    }
  }

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
  prefetchedBlocksMap: Map<string, PrefetchedBlock>
): Promise<void> => {
  const halfPrefetchBlockCount = jobQueueConfig.prefetchBlockCount / 2;

  // Check if prefetched blocks are less than half.
  if (prefetchedBlocksMap.size <= halfPrefetchBlockCount) {
    let latestPrefetchedBlockNumber = blockNumber;

    Array.from(prefetchedBlocksMap.values()).forEach(({ block }) => {
      if (Number(block.blockNumber) > latestPrefetchedBlockNumber) {
        latestPrefetchedBlockNumber = Number(block.blockNumber);
      }
    });

    const blocksWithEvents = await fetchBatchBlocks(
      indexer,
      jobQueueConfig,
      latestPrefetchedBlockNumber + 1,
      latestPrefetchedBlockNumber + halfPrefetchBlockCount
    );

    blocksWithEvents.forEach(({ block, events }) => {
      prefetchedBlocksMap.set(block.blockHash, { block, events });
      latestPrefetchedBlockNumber = Number(block.blockNumber);
    });
  }
};

/**
 * Method to fetch blocks (with events) in the given range.
 * @param indexer
 * @param blockDelayInMilliSecs
 * @param startBlock
 * @param endBlock
 */
export const fetchBatchBlocks = async (indexer: IndexerInterface, jobQueueConfig: JobQueueConfig, startBlock: number, endBlock: number): Promise<any[]> => {
  let blockNumbers = [...Array(endBlock - startBlock + 1).keys()].map(n => n + startBlock);
  let blocks = [];

  // Fetch blocks again if there are missing blocks.
  while (true) {
    console.time('time:common#fetchBatchBlocks-getBlocks');
    const blockPromises = blockNumbers.map(async blockNumber => indexer.getBlocks({ blockNumber }));
    console.timeEnd('time:common#fetchBatchBlocks-getBlocks');

    const res = await Promise.all(blockPromises);
    const missingIndex = res.findIndex(blocks => blocks.length === 0);

    // TODO Continue to process available blocks instead of retrying for whole range.
    if (missingIndex < 0) {
      blocks = blocks.concat(res);
      break;
    }

    log('missing block number:', blockNumbers[missingIndex]);

    blocks.push(res.slice(0, missingIndex));
    blockNumbers = blockNumbers.slice(missingIndex);
    await wait(jobQueueConfig.blockDelayInMilliSecs);
  }

  blocks = blocks.flat();

  if (jobQueueConfig.jobDelayInMilliSecs) {
    await wait(jobQueueConfig.jobDelayInMilliSecs);
  }

  // TODO Catch errors and continue to process available events instead of retrying for whole range because of an error.
  const blockAndEventPromises = blocks.map(async block => {
    block.blockTimestamp = block.timestamp;
    const events = await indexer.fetchBlockEvents(block);

    return { block, events };
  });

  return Promise.all(blockAndEventPromises);
};

/**
 * Process events in batches for a block.
 * @param indexer
 * @param block
 * @param eventsInBatch
 */
export const processBatchEvents = async (indexer: IndexerInterface, block: BlockProgressInterface, eventsInBatch: number): Promise<void> => {
  // Check if block processing is complete.
  while (block.numProcessedEvents < block.numEvents) {
    console.time('time:common#processBacthEvents-fetching_events_batch');

    // Fetch events in batches
    const events = await indexer.getBlockEvents(
      block.blockHash,
      {
        index: [
          { value: block.lastProcessedEventIndex + 1, operator: 'gte', not: false }
        ]
      },
      {
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

    for (let event of events) {
      // Process events in loop

      const eventIndex = event.index;
      // log(`Processing event ${event.id} index ${eventIndex}`);

      // Check that events are processed in order.
      if (eventIndex <= block.lastProcessedEventIndex) {
        throw new Error(`Events received out of order for block number ${block.blockNumber} hash ${block.blockHash}, got event index ${eventIndex} and lastProcessedEventIndex ${block.lastProcessedEventIndex}, aborting`);
      }

      // Check if previous event in block has been processed exactly before this and abort if not.
      // Skip check if logs fetched are filtered by contract address.
      if (!indexer.serverConfig.filterLogs) {
        const prevIndex = eventIndex - 1;

        if (prevIndex !== block.lastProcessedEventIndex) {
          throw new Error(`Events received out of order for block number ${block.blockNumber} hash ${block.blockHash},` +
          ` prev event index ${prevIndex}, got event index ${event.index} and lastProcessedEventIndex ${block.lastProcessedEventIndex}, aborting`);
        }
      }

      let watchedContract;

      if (!indexer.isWatchedContract) {
        // uni-info-watcher indexer doesn't have watched contracts implementation.
        watchedContract = true;
      } else {
        watchedContract = await indexer.isWatchedContract(event.contract);
      }

      if (watchedContract) {
        // We might not have parsed this event yet. This can happen if the contract was added
        // as a result of a previous event in the same block.
        if (event.eventName === UNKNOWN_EVENT_NAME) {
          const logObj = JSON.parse(event.extraInfo);

          assert(indexer.parseEventNameAndArgs);
          assert(typeof watchedContract !== 'boolean');
          const { eventName, eventInfo } = indexer.parseEventNameAndArgs(watchedContract.kind, logObj);

          event.eventName = eventName;
          event.eventInfo = JSON.stringify(eventInfo);
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
      await indexer.processBlockAfterEvents(block.blockHash);
    }
  }

  block.isComplete = true;
  console.time('time:common#processBatchEvents-updateBlockProgress');
  await indexer.updateBlockProgress(block, block.lastProcessedEventIndex);
  console.timeEnd('time:common#processBatchEvents-updateBlockProgress');
};
