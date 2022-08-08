import debug from 'debug';
import assert from 'assert';

import { JOB_KIND_PRUNE, QUEUE_BLOCK_PROCESSING, JOB_KIND_INDEX, UNKNOWN_EVENT_NAME } from './constants';
import { JobQueue } from './job-queue';
import { BlockProgressInterface, IndexerInterface } from './types';
import { wait } from './misc';
import { OrderDirection } from './database';

const DEFAULT_EVENTS_IN_BATCH = 50;

const log = debug('vulcanize:common');

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
 * Method to fetch block by number and push to job queue.
 * @param jobQueue
 * @param indexer
 * @param ethClient
 * @param blockNumber
 */
export const processBlockByNumber = async (
  jobQueue: JobQueue,
  indexer: IndexerInterface,
  blockDelayInMilliSecs: number,
  blockNumber: number
): Promise<void> => {
  log(`Process block ${blockNumber}`);

  console.time('time:common#processBlockByNumber-get-blockProgress-syncStatus');

  const [blockProgressEntities, syncStatus] = await Promise.all([
    indexer.getBlocksAtHeight(blockNumber, false),
    indexer.getSyncStatus()
  ]);

  console.timeEnd('time:common#processBlockByNumber-get-blockProgress-syncStatus');

  while (true) {
    let blocks = blockProgressEntities.map((block: any) => {
      block.timestamp = block.blockTimestamp;

      return block;
    });

    if (!blocks.length) {
      console.time('time:common#processBlockByNumber-ipld-eth-server');
      blocks = await indexer.getBlocks({ blockNumber });
      console.timeEnd('time:common#processBlockByNumber-ipld-eth-server');
    }

    if (blocks.length) {
      for (let bi = 0; bi < blocks.length; bi++) {
        const { cid, blockHash, blockNumber, parentHash, timestamp } = blocks[bi];

        // Stop blocks already pushed to job queue. They are already retried after fail.
        if (!syncStatus || syncStatus.chainHeadBlockNumber < blockNumber) {
          await jobQueue.pushJob(
            QUEUE_BLOCK_PROCESSING,
            {
              kind: JOB_KIND_INDEX,
              blockNumber: Number(blockNumber),
              cid,
              blockHash,
              parentHash,
              timestamp
            }
          );
        }
      }

      await indexer.updateSyncStatusChainHead(blocks[0].blockHash, Number(blocks[0].blockNumber));

      return;
    }

    log(`No blocks fetched for block number ${blockNumber}, retrying after ${blockDelayInMilliSecs} ms delay.`);

    await wait(blockDelayInMilliSecs);
  }
};

/**
 * Process events in batches for a block.
 * @param indexer
 * @param block
 * @param eventsInBatch
 */
export const processBatchEvents = async (indexer: IndexerInterface, block: BlockProgressInterface, eventsInBatch: number): Promise<void> => {
  // Check if block processing is complete.
  while (!block.isComplete) {
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

    console.time('time:common#processBacthEvents-processing_events_batch');

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

    console.timeEnd('time:common#processBacthEvents-processing_events_batch');
  }

  if (indexer.processBlockAfterEvents) {
    await indexer.processBlockAfterEvents(block.blockHash);
  }
};
