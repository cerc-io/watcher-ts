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
  UNKNOWN_EVENT_NAME,
  NULL_BLOCK_ERROR
} from './constants';
import { JobQueue } from './job-queue';
import { BlockProgressInterface, IndexerInterface, EventInterface, EthFullTransaction, EthFullBlock } from './types';
import { wait } from './misc';
import { OrderDirection } from './database';
import { JobQueueConfig } from './config';

const DEFAULT_EVENTS_IN_BATCH = 50;

const log = debug('vulcanize:common');
const JSONbigNative = JSONbig({ useNativeBigInt: true });

export interface PrefetchedBlock {
  block: BlockProgressInterface;
  events: DeepPartial<EventInterface>[];
  ethFullBlock: EthFullBlock;
  ethFullTransactions: EthFullTransaction[];
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
      // TODO: Get full block and set in blockEventsMap
      blocks = await indexer.getBlocks({ blockNumber });

      if (!blocks.length) {
        log(`No blocks fetched for block number ${blockNumber}, retrying after ${jobQueueConfig.blockDelayInMilliSecs} ms delay.`);
        await wait(jobQueueConfig.blockDelayInMilliSecs);
      }
    } catch (err: any) {
      // Handle null block error in case of Lotus EVM
      if (!(err.code === errors.SERVER_ERROR && err.error && err.error.message === NULL_BLOCK_ERROR)) {
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
      blockTimestamp: Number(timestamp)
    });
  }

  await indexer.updateSyncStatusChainHead(blocks[0].blockHash, blocks[0].blockNumber);

  return blocksToBeIndexed;
};

/**
 * Method to fetch and save filtered logs and blocks in a given range.
 * @param indexer
 * @param blockAndEventsMap
 * @param startBlock
 * @param endBlock
 */
export const fetchAndSaveFilteredLogsAndBlocks = async (
  indexer: IndexerInterface,
  blockAndEventsMap: Map<string, PrefetchedBlock>,
  startBlock: number,
  endBlock: number
): Promise<BlockProgressInterface[]> => {
  // Fetch filtered logs and required blocks
  console.time('time:common#fetchAndSaveFilteredLogsAndBlocks-fetchAndSaveFilteredEventsAndBlocks');
  const blocksData = await indexer.fetchAndSaveFilteredEventsAndBlocks(startBlock, endBlock);
  console.timeEnd('time:common#fetchAndSaveFilteredLogsAndBlocks-fetchAndSaveFilteredEventsAndBlocks');

  // Set blocks with events in blockAndEventsMap cache
  blocksData.forEach(({ blockProgress, events, ethFullBlock, ethFullTransactions }) => {
    blockAndEventsMap.set(blockProgress.blockHash, { block: blockProgress, events, ethFullBlock, ethFullTransactions });
  });

  return blocksData.map(({ blockProgress }) => blockProgress);
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
    blockAndEventsMap.set(
      blockProgress.blockHash,
      {
        block: blockProgress,
        events,
        // TODO: Set ethFullBlock and ethFullTransactions
        ethFullBlock: {} as EthFullBlock,
        ethFullTransactions: []
      });
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
      if (!(err.code === errors.SERVER_ERROR && err.error && err.error.message === NULL_BLOCK_ERROR)) {
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
    block.blockTimestamp = Number(block.timestamp);
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
export const processBatchEvents = async (
  indexer: IndexerInterface,
  data: {
    block: BlockProgressInterface;
    ethFullBlock: EthFullBlock;
    ethFullTransactions: EthFullTransaction[];
  },
  { eventsInBatch, subgraphEventsOrder }: {
    eventsInBatch: number;
    subgraphEventsOrder: boolean;
  }
): Promise<boolean> => {
  let dbBlock: BlockProgressInterface, updatedDbEvents: EventInterface[];
  let isNewContractWatched = false;

  if (subgraphEventsOrder) {
    ({ dbBlock, updatedDbEvents, isNewContractWatched } = await _processEventsInSubgraphOrder(indexer, data, eventsInBatch || DEFAULT_EVENTS_IN_BATCH));
  } else {
    ({ dbBlock, updatedDbEvents } = await _processEvents(indexer, data, eventsInBatch || DEFAULT_EVENTS_IN_BATCH));
  }

  if (indexer.processBlockAfterEvents) {
    if (!dbBlock.isComplete) {
      await indexer.processBlockAfterEvents(dbBlock.blockHash, dbBlock.blockNumber);
    }
  }

  dbBlock.isComplete = true;

  console.time('time:common#processBatchEvents-updateBlockProgress-saveEvents');
  await Promise.all([
    indexer.updateBlockProgress(dbBlock, dbBlock.lastProcessedEventIndex),
    indexer.saveEvents(updatedDbEvents)
  ]);
  console.timeEnd('time:common#processBatchEvents-updateBlockProgress-saveEvents');

  return isNewContractWatched;
};

const _processEvents = async (
  indexer: IndexerInterface,
  { block, ethFullBlock, ethFullTransactions }: {
    block: BlockProgressInterface;
    ethFullBlock: EthFullBlock;
    ethFullTransactions: EthFullTransaction[];
  },
  eventsInBatch: number
): Promise<{ dbBlock: BlockProgressInterface, updatedDbEvents: EventInterface[] }> => {
  const updatedDbEvents: EventInterface[] = [];

  let page = 0;
  let numFetchedEvents = 0;

  // Check if we are out of events.
  while (numFetchedEvents < block.numEvents) {
    console.time('time:common#processEvents-fetching_events_batch');

    // Fetch events in batches
    const events = await _getEventsBatch(indexer, block.blockHash, eventsInBatch, page);
    page++;
    numFetchedEvents += events.length;

    console.timeEnd('time:common#processEvents-fetching_events_batch');

    if (events.length) {
      log(`Processing events batch from index ${events[0].index} to ${events[0].index + events.length - 1}`);
    }

    console.time('time:common#processEvents-processing_events_batch');

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
          // Parse the unknown event and save updated event to the db
          event = _parseUnknownEvent(indexer, event, watchedContract.kind);
          updatedDbEvents.push(event);
        }

        await indexer.processEvent(event, { ethFullBlock, ethFullTransactions });
      }

      block.lastProcessedEventIndex = event.index;
      block.numProcessedEvents++;
    }

    console.timeEnd('time:common#processEvents-processing_events_batch');
  }

  // TODO: Fetch and reprocess events if filterByAddresses true and new contracts found

  return { dbBlock: block, updatedDbEvents: updatedDbEvents };
};

const _processEventsInSubgraphOrder = async (
  indexer: IndexerInterface,
  { block, ethFullBlock, ethFullTransactions }: {
    block: BlockProgressInterface;
    ethFullBlock: EthFullBlock;
    ethFullTransactions: EthFullTransaction[];
  },
  eventsInBatch: number
): Promise<{ dbBlock: BlockProgressInterface, updatedDbEvents: EventInterface[], isNewContractWatched: boolean }> => {
  // Create list of initially watched contracts
  const initiallyWatchedContracts: string[] = indexer.getWatchedContracts().map(contract => contract.address);
  const unwatchedContractEvents: EventInterface[] = [];
  let isNewContractWatched = false;

  const updatedDbEvents: EventInterface[] = [];

  let page = 0;
  let numFetchedEvents = 0;

  // Check if we are out of events.
  while (numFetchedEvents < block.numEvents) {
    console.time(`time:common#processEventsInSubgraphOrder-fetching_events_batch-${block.blockNumber}`);

    // Fetch events in batches
    const events = await _getEventsBatch(indexer, block.blockHash, eventsInBatch, page);
    page++;
    numFetchedEvents += events.length;

    console.timeEnd(`time:common#processEventsInSubgraphOrder-fetching_events_batch-${block.blockNumber}`);

    if (events.length) {
      log(`Processing events batch from index ${events[0].index} to ${events[0].index + events.length - 1}`);
    }

    console.time(`time:common#processEventsInSubgraphOrder-processing_events_batch-${block.blockNumber}`);

    // First process events for initially watched contracts
    const watchedContractEvents: EventInterface[] = [];
    events.forEach(event => {
      if (initiallyWatchedContracts.includes(event.contract)) {
        watchedContractEvents.push(event);
      } else {
        unwatchedContractEvents.push(event);
      }
    });

    // Process known events in a loop
    for (const event of watchedContractEvents) {
      console.time(`time:common#_processEventsInSubgraphOrder-block-${block.blockNumber}-processEvent-${event.eventName}`);
      await indexer.processEvent(event, { ethFullBlock, ethFullTransactions });
      console.timeEnd(`time:common#_processEventsInSubgraphOrder-block-${block.blockNumber}-processEvent-${event.eventName}`);

      block.lastProcessedEventIndex = event.index;
      block.numProcessedEvents++;
    }

    console.timeEnd(`time:common#processEventsInSubgraphOrder-processing_events_batch-${block.blockNumber}`);
  }

  const watchedContracts = indexer.getWatchedContracts().map(contract => contract.address);

  // Check if there are new watched contracts
  if (watchedContracts.length > initiallyWatchedContracts.length) {
    isNewContractWatched = true;

    // Check if filterLogsByAddresses is set to true
    if (indexer.upstreamConfig.ethServer.filterLogsByAddresses) {
      // Fetch and parse events for newly watched contracts
      const newContracts = watchedContracts.filter(contract => !initiallyWatchedContracts.includes(contract));
      console.time(`time:common#_processEventsInSubgraphOrder-fetchEventsForContracts-block-${block.blockNumber}-unwatched-contract`);
      const events = await indexer.fetchEventsForContracts(block.blockHash, block.blockNumber, newContracts);
      console.timeEnd(`time:common#_processEventsInSubgraphOrder-fetchEventsForContracts-block-${block.blockNumber}-unwatched-contract`);

      events.forEach(event => {
        event.block = block;
        updatedDbEvents.push(event as EventInterface);
      });
    }
  }

  // Parse events of initially unwatched contracts
  for (let event of unwatchedContractEvents) {
    const watchedContract = indexer.isWatchedContract(event.contract);

    if (watchedContract) {
      // We might not have parsed this event yet. This can happen if the contract was added
      // as a result of a previous event in the same block.
      if (event.eventName === UNKNOWN_EVENT_NAME) {
        // Parse the unknown event and save updated event to the db
        event = _parseUnknownEvent(indexer, event, watchedContract.kind);
        updatedDbEvents.push(event);
      }
    }
  }

  console.time('time:common#processEventsInSubgraphOrder-processing_initially_unwatched_events');
  // In the end process events of newly watched contracts
  for (const updatedDbEvent of updatedDbEvents) {
    console.time(`time:common#processEventsInSubgraphOrder-block-${block.blockNumber}-updated-processEvent-${updatedDbEvent.eventName}`);
    await indexer.processEvent(updatedDbEvent, { ethFullBlock, ethFullTransactions });
    console.timeEnd(`time:common#processEventsInSubgraphOrder-block-${block.blockNumber}-updated-processEvent-${updatedDbEvent.eventName}`);

    block.lastProcessedEventIndex = Math.max(block.lastProcessedEventIndex + 1, updatedDbEvent.index);
    block.numProcessedEvents++;
  }
  console.timeEnd('time:common#processEventsInSubgraphOrder-processing_initially_unwatched_events');

  return { dbBlock: block, updatedDbEvents: updatedDbEvents, isNewContractWatched };
};

const _getEventsBatch = async (indexer: IndexerInterface, blockHash: string, eventsInBatch: number, page: number): Promise<EventInterface[]> => {
  return indexer.getBlockEvents(
    blockHash,
    {},
    {
      skip: page * eventsInBatch,
      limit: eventsInBatch,
      orderBy: 'index',
      orderDirection: OrderDirection.asc
    }
  );
};

const _parseUnknownEvent = (indexer: IndexerInterface, event: EventInterface, contractKind: string): EventInterface => {
  const logObj = JSONbigNative.parse(event.extraInfo);

  assert(indexer.parseEventNameAndArgs);
  const { eventName, eventInfo, eventSignature } = indexer.parseEventNameAndArgs(contractKind, logObj);

  event.eventName = eventName;
  event.eventInfo = JSONbigNative.stringify(eventInfo);
  event.extraInfo = JSONbigNative.stringify({
    ...logObj,
    eventSignature
  });

  return event;
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
export const createHooksJob = async (jobQueue: JobQueue, blockHash: string): Promise<void> => {
  await jobQueue.pushJob(
    QUEUE_HOOKS,
    {
      blockHash
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
