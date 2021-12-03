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

  while (true) {
    const blocks = await indexer.getBlocks({ blockNumber });

    if (blocks.length) {
      for (let bi = 0; bi < blocks.length; bi++) {
        const { blockHash, blockNumber, parentHash, timestamp } = blocks[bi];
        const blockProgress = await indexer.getBlockProgress(blockHash);

        if (blockProgress) {
          log(`Block number ${blockNumber}, block hash ${blockHash} already processed`);
        } else {
          await indexer.updateSyncStatusChainHead(blockHash, blockNumber);

          await jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { kind: JOB_KIND_INDEX, blockHash, blockNumber, parentHash, timestamp });
        }
      }

      return;
    }

    log(`No blocks fetched for block number ${blockNumber}, retrying after ${blockDelayInMilliSecs} ms delay.`);

    await wait(blockDelayInMilliSecs);
  }
};
