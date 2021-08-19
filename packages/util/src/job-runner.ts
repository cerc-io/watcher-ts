//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';

import { MAX_REORG_DEPTH, QUEUE_BLOCK_PROCESSING } from './constants';
import { JobQueue } from './job-queue';
import { EventInterface, IndexerInterface } from './types';

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: IndexerInterface
  _jobQueue: JobQueue

  constructor (indexer: IndexerInterface, jobQueue: JobQueue) {
    this._indexer = indexer;
    this._jobQueue = jobQueue;
  }

  async processBlock (job: any): Promise<void> {
    const { data: { blockHash, blockNumber, parentHash, priority } } = job;

    log(`Processing block number ${blockNumber} hash ${blockHash} `);

    // Init sync status record if none exists.
    let syncStatus = await this._indexer.getSyncStatus();
    if (!syncStatus) {
      syncStatus = await this._indexer.updateSyncStatusChainHead(blockHash, blockNumber);
    }

    // Check if parent block has been processed yet, if not, push a high priority job to process that first and abort.
    // However, don't go beyond the `latestCanonicalBlockHash` from SyncStatus as we have to assume the reorg can't be that deep.
    if (blockHash !== syncStatus.latestCanonicalBlockHash) {
      const parent = await this._indexer.getBlockProgress(parentHash);
      if (!parent) {
        const { number: parentBlockNumber, parent: { hash: grandparentHash }, timestamp: parentTimestamp } = await this._indexer.getBlock(parentHash);

        // Create a higher priority job to index parent block and then abort.
        // We don't have to worry about aborting as this job will get retried later.
        const newPriority = (priority || 0) + 1;
        await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
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

      if (parentHash !== syncStatus.latestCanonicalBlockHash && !parent.isComplete) {
        // Parent block indexing needs to finish before this block can be indexed.
        const message = `Indexing incomplete for parent block number ${parent.blockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash}, aborting`;
        log(message);

        throw new Error(message);
      }
    }
  }

  async processEvent (job: any): Promise<EventInterface> {
    const { data: { id } } = job;

    log(`Processing event ${id}`);

    const dbEvent = await this._indexer.getEvent(id);
    assert(dbEvent);

    const event = dbEvent;

    // Confirm that the parent block has been completely processed.
    // We don't have to worry about aborting as this job will get retried later.
    const parent = await this._indexer.getBlockProgress(event.block.parentHash);
    if (!parent || !parent.isComplete) {
      const message = `Abort processing of event ${id} as parent block not processed yet`;
      throw new Error(message);
    }

    const blockProgress = await this._indexer.getBlockProgress(event.block.blockHash);
    assert(blockProgress);

    const events = await this._indexer.getBlockEvents(event.block.blockHash);
    const eventIndex = events.findIndex((e: any) => e.id === event.id);
    assert(eventIndex !== -1);

    // Check if previous event in block has been processed exactly before this and abort if not.
    if (eventIndex > 0) { // Skip the first event in the block.
      const prevIndex = eventIndex - 1;
      const prevEvent = events[prevIndex];
      if (prevEvent.index !== blockProgress.lastProcessedEventIndex) {
        throw new Error(`Events received out of order for block number ${event.block.blockNumber} hash ${event.block.blockHash},` +
        ` prev event index ${prevEvent.index}, got event index ${event.index} and lastProcessedEventIndex ${blockProgress.lastProcessedEventIndex}, aborting`);
      }
    }

    return event;
  }

  async pruneChain (job: any): Promise<void> {
    const pruneBlockHeight: number = job.data.pruneBlockHeight;

    log(`Processing chain pruning at ${pruneBlockHeight}`);

    // Assert we're at a depth where pruning is safe.
    const syncStatus = await this._indexer.getSyncStatus();
    assert(syncStatus);
    assert(syncStatus.latestIndexedBlockNumber >= (pruneBlockHeight + MAX_REORG_DEPTH));

    // Check that we haven't already pruned at this depth.
    if (syncStatus.latestCanonicalBlockNumber >= pruneBlockHeight) {
      log(`Already pruned at block height ${pruneBlockHeight}, latestCanonicalBlockNumber ${syncStatus.latestCanonicalBlockNumber}`);
    } else {
      // Check how many branches there are at the given height/block number.
      const blocksAtHeight = await this._indexer.getBlocksAtHeight(pruneBlockHeight, false);

      // Should be at least 1.
      assert(blocksAtHeight.length);

      // We have more than one node at this height, so prune all nodes not reachable from head.
      // This will lead to orphaned nodes, which will get pruned at the next height.
      if (blocksAtHeight.length > 1) {
        for (let i = 0; i < blocksAtHeight.length; i++) {
          const block = blocksAtHeight[i];
          // If this block is not reachable from the latest indexed block, mark it as pruned.
          const isAncestor = await this._indexer.blockIsAncestor(block.blockHash, syncStatus.latestIndexedBlockHash, MAX_REORG_DEPTH);
          if (!isAncestor) {
            await this._indexer.markBlockAsPruned(block);
          }
        }
      }
    }
  }
}
