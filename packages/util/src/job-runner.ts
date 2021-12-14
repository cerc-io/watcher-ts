//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { In } from 'typeorm';

import { JobQueueConfig } from './config';
import { JOB_KIND_INDEX, JOB_KIND_PRUNE, JOB_KIND_EVENTS, JOB_KIND_CONTRACT, MAX_REORG_DEPTH, QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING, UNKNOWN_EVENT_NAME } from './constants';
import { JobQueue } from './job-queue';
import { EventInterface, IndexerInterface, SyncStatusInterface } from './types';
import { wait } from './misc';
import { createPruningJob } from './common';
import { OrderDirection } from './database';

const DEFAULT_EVENTS_IN_BATCH = 50;

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: IndexerInterface
  _jobQueue: JobQueue
  _jobQueueConfig: JobQueueConfig

  constructor (jobQueueConfig: JobQueueConfig, indexer: IndexerInterface, jobQueue: JobQueue) {
    this._jobQueueConfig = jobQueueConfig;
    this._indexer = indexer;
    this._jobQueue = jobQueue;
  }

  async processBlock (job: any): Promise<void> {
    const { data: { kind } } = job;

    const syncStatus = await this._indexer.getSyncStatus();
    assert(syncStatus);

    switch (kind) {
      case JOB_KIND_INDEX:
        await this._indexBlock(job, syncStatus);
        break;

      case JOB_KIND_PRUNE:
        await this._pruneChain(job, syncStatus);
        break;

      default:
        log(`Invalid Job kind ${kind} in QUEUE_BLOCK_PROCESSING.`);
        break;
    }

    await this._jobQueue.markComplete(job);
  }

  async processEvent (job: any): Promise<EventInterface | void> {
    const { data: { kind } } = job;

    switch (kind) {
      case JOB_KIND_EVENTS:
        await this._processEvents(job);
        break;

      case JOB_KIND_CONTRACT:
        await this._updateWatchedContracts(job);
        break;

      default:
        log(`Invalid Job kind ${kind} in QUEUE_EVENT_PROCESSING.`);
        break;
    }

    await this._jobQueue.markComplete(job);
  }

  async _pruneChain (job: any, syncStatus: SyncStatusInterface): Promise<void> {
    const { pruneBlockHeight } = job.data;

    log(`Processing chain pruning at ${pruneBlockHeight}`);

    // Assert we're at a depth where pruning is safe.
    assert(syncStatus.latestIndexedBlockNumber >= (pruneBlockHeight + MAX_REORG_DEPTH));

    // Check that we haven't already pruned at this depth.
    if (syncStatus.latestCanonicalBlockNumber >= pruneBlockHeight) {
      log(`Already pruned at block height ${pruneBlockHeight}, latestCanonicalBlockNumber ${syncStatus.latestCanonicalBlockNumber}`);
    } else {
      // Check how many branches there are at the given height/block number.
      const blocksAtHeight = await this._indexer.getBlocksAtHeight(pruneBlockHeight, false);

      // Should be at least 1.
      assert(blocksAtHeight.length);

      // We have more than one node at this height, so prune all nodes not reachable from indexed block at max reorg depth from prune height.
      // This will lead to orphaned nodes, which will get pruned at the next height.
      if (blocksAtHeight.length > 1) {
        const [indexedBlock] = await this._indexer.getBlocksAtHeight(pruneBlockHeight + MAX_REORG_DEPTH, false);

        // Get ancestor blockHash from indexed block at prune height.
        const ancestorBlockHash = await this._indexer.getAncestorAtDepth(indexedBlock.blockHash, MAX_REORG_DEPTH);

        const blocksToBePruned = blocksAtHeight.filter(block => ancestorBlockHash !== block.blockHash);

        if (blocksToBePruned.length) {
          // Mark blocks pruned which are not the ancestor block.
          await this._indexer.markBlocksAsPruned(blocksToBePruned);
        }
      }
    }
  }

  async _indexBlock (job: any, syncStatus: SyncStatusInterface): Promise<void> {
    const { data: { blockHash, blockNumber, parentHash, priority, timestamp } } = job;
    log(`Processing block number ${blockNumber} hash ${blockHash} `);

    // Check if chain pruning is caught up.
    if ((syncStatus.latestIndexedBlockNumber - syncStatus.latestCanonicalBlockNumber) > MAX_REORG_DEPTH) {
      await createPruningJob(this._jobQueue, syncStatus.latestCanonicalBlockNumber, priority);

      const message = `Chain pruning not caught up yet, latest canonical block number ${syncStatus.latestCanonicalBlockNumber} and latest indexed block number ${syncStatus.latestIndexedBlockNumber}`;
      log(message);
      throw new Error(message);
    }

    let [parentBlock, blockProgress] = await this._indexer.getBlockProgressEntities(
      {
        blockHash: In([parentHash, blockHash])
      },
      {
        order: {
          blockNumber: 'ASC'
        }
      }
    );

    // Check if parent block has been processed yet, if not, push a high priority job to process that first and abort.
    // However, don't go beyond the `latestCanonicalBlockHash` from SyncStatus as we have to assume the reorg can't be that deep.
    if (blockHash !== syncStatus.latestCanonicalBlockHash) {
      if (!parentBlock || parentBlock.blockHash !== parentHash) {
        const blocks = await this._indexer.getBlocks({ blockHash: parentHash });

        if (!blocks.length) {
          const message = `No blocks at parentHash ${parentHash}, aborting`;
          log(message);

          throw new Error(message);
        }

        const [{ blockNumber: parentBlockNumber, parentHash: grandparentHash, timestamp: parentTimestamp }] = blocks;

        // Create a higher priority job to index parent block and then abort.
        // We don't have to worry about aborting as this job will get retried later.
        const newPriority = (priority || 0) + 1;
        await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
          kind: JOB_KIND_INDEX,
          blockHash: parentHash,
          blockNumber: parentBlockNumber,
          parentHash: grandparentHash,
          timestamp: parentTimestamp,
          priority: newPriority
        }, { priority: newPriority });

        const message = `Parent block number ${parentBlockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash} not fetched yet, aborting`;
        log(message);

        throw new Error(message);
      }

      if (!parentBlock.isComplete) {
        // Parent block indexing needs to finish before this block can be indexed.
        const message = `Indexing incomplete for parent block number ${parentBlock.blockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash}, aborting`;
        log(message);

        throw new Error(message);
      }
    }

    // Check if block is being already processed.
    if (!blockProgress) {
      const { jobDelayInMilliSecs = 0 } = this._jobQueueConfig;

      // Delay required to process block.
      await wait(jobDelayInMilliSecs);
      blockProgress = await this._indexer.fetchBlockEvents({ blockHash, blockNumber, parentHash, blockTimestamp: timestamp });

      if (blockProgress.numEvents) {
        await this._jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { kind: JOB_KIND_EVENTS, blockHash: blockProgress.blockHash, publish: true });
      }
    }
  }

  async _processEvents (job: any): Promise<void> {
    const { blockHash } = job.data;

    let block = await this._indexer.getBlockProgress(blockHash);
    assert(block);

    console.time('time:job-runner#_processEvents-events');

    while (!block.isComplete) {
      console.time('time:job-runner#_processEvents-fetching_events_batch');

      // Fetch events in batches
      const events: EventInterface[] = await this._indexer.getBlockEvents(
        blockHash,
        {
          index: [
            { value: block.lastProcessedEventIndex + 1, operator: 'gte', not: false }
          ]
        },
        {
          limit: this._jobQueueConfig.eventsInBatch || DEFAULT_EVENTS_IN_BATCH,
          orderBy: 'index',
          orderDirection: OrderDirection.asc
        }
      );

      console.timeEnd('time:job-runner#_processEvents-fetching_events_batch');

      console.time('time:job-runner#_processEvents-processing_events_batch');

      for (let event of events) {
        // Process events in loop

        const eventIndex = event.index;
        log(`Processing event ${event.id} index ${eventIndex}`);

        // Check if previous event in block has been processed exactly before this and abort if not.
        if (eventIndex > 0) { // Skip the first event in the block.
          const prevIndex = eventIndex - 1;

          if (prevIndex !== block.lastProcessedEventIndex) {
            throw new Error(`Events received out of order for block number ${block.blockNumber} hash ${block.blockHash},` +
            ` prev event index ${prevIndex}, got event index ${event.index} and lastProcessedEventIndex ${block.lastProcessedEventIndex}, aborting`);
          }
        }

        let watchedContract;

        if (!this._indexer.isWatchedContract) {
          // uni-info-watcher indexer doesn't have watched contracts implementation.
          watchedContract = true;
        } else {
          watchedContract = await this._indexer.isWatchedContract(event.contract);
        }

        if (watchedContract) {
          // We might not have parsed this event yet. This can happen if the contract was added
          // as a result of a previous event in the same block.
          if (event.eventName === UNKNOWN_EVENT_NAME) {
            const logObj = JSON.parse(event.extraInfo);

            assert(this._indexer.parseEventNameAndArgs);
            assert(typeof watchedContract !== 'boolean');
            const { eventName, eventInfo } = this._indexer.parseEventNameAndArgs(watchedContract.kind, logObj);

            event.eventName = eventName;
            event.eventInfo = JSON.stringify(eventInfo);
            event = await this._indexer.saveEventEntity(event);
          }

          await this._indexer.processEvent(event);
        }

        block = await this._indexer.updateBlockProgress(block, event.index);
      }

      console.timeEnd('time:job-runner#_processEvents-processing_events_batch');
    }

    console.timeEnd('time:job-runner#_processEvents-events');
  }

  async _updateWatchedContracts (job: any): Promise<void> {
    const { data: { contract } } = job;

    assert(this._indexer.cacheContract);
    this._indexer.cacheContract(contract);
  }
}
