import debug from 'debug';

import { JOB_KIND_PRUNE, QUEUE_BLOCK_PROCESSING, JOB_KIND_INDEX } from './constants';
import { JobQueue } from './job-queue';
import { IndexerInterface } from './types';
import { wait } from './misc';

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
      console.time('time:common#processBlockByNumber-postgraphile');
      blocks = await indexer.getBlocks({ blockNumber });
      console.timeEnd('time:common#processBlockByNumber-postgraphile');
    }

    if (blocks.length) {
      for (let bi = 0; bi < blocks.length; bi++) {
        const { blockHash, blockNumber, parentHash, timestamp } = blocks[bi];

        // Stop blocks already pushed to job queue. They are already retried after fail.
        if (!syncStatus || syncStatus.chainHeadBlockNumber < blockNumber) {
          await jobQueue.pushJob(
            QUEUE_BLOCK_PROCESSING,
            {
              kind: JOB_KIND_INDEX,
              blockNumber: Number(blockNumber),
              blockHash,
              parentHash,
              timestamp
            }
          );
        }
      }

      return;
    }

    log(`No blocks fetched for block number ${blockNumber}, retrying after ${blockDelayInMilliSecs} ms delay.`);

    await wait(blockDelayInMilliSecs);
  }
};
