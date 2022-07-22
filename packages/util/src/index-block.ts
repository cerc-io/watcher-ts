//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';

import { BlockProgressInterface, IndexerInterface } from './types';
import { processBatchEvents } from './common';

export const indexBlock = async (
  indexer: IndexerInterface,
  eventsInBatch: number,
  argv: {
    block: number,
  }
): Promise<any> => {
  let blockProgressEntities: Partial<BlockProgressInterface>[] = await indexer.getBlocksAtHeight(argv.block, false);

  if (!blockProgressEntities.length) {
    console.time('time:index-block#getBlocks-ipld-eth-server');
    const blocks = await indexer.getBlocks({ blockNumber: argv.block });

    blockProgressEntities = blocks.map((block: any): Partial<BlockProgressInterface> => {
      block.blockTimestamp = block.timestamp;

      return block;
    });

    console.timeEnd('time:index-block#getBlocks-ipld-eth-server');
  }

  assert(blockProgressEntities.length, `No blocks fetched for block number ${argv.block}.`);

  for (const partialblockProgress of blockProgressEntities) {
    let blockProgress: BlockProgressInterface;

    // Check if blockProgress fetched from database.
    if (!partialblockProgress.id) {
      blockProgress = await indexer.fetchBlockEvents(partialblockProgress);
    } else {
      blockProgress = partialblockProgress as BlockProgressInterface;
    }

    assert(indexer.processBlock);
    await indexer.processBlock(blockProgress.blockHash, blockProgress.blockNumber);

    await processBatchEvents(indexer, blockProgress, eventsInBatch);
  }
};
