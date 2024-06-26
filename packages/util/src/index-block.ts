//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';

import { BlockProgressInterface, IndexerInterface } from './types';
import { processBatchEvents } from './common';
import { EthFullBlock } from '.';

export const indexBlock = async (
  indexer: IndexerInterface,
  eventsInBatch: number,
  subgraphEventsOrder: boolean,
  argv: {
    block: number,
  }
): Promise<any> => {
  let blockProgressEntities: Partial<BlockProgressInterface>[] = await indexer.getBlocksAtHeight(argv.block, false);

  if (!blockProgressEntities.length) {
    console.time('time:index-block#getBlocks-ipld-eth-server');
    const blocks = await indexer.getBlocks({ blockNumber: argv.block });

    // Filter null blocks and transform to BlockProgress type
    blockProgressEntities = blocks.filter(block => Boolean(block))
      .map((block: any): Partial<BlockProgressInterface> => {
        block.blockTimestamp = Number(block.timestamp);
        block.blockNumber = Number(block.blockNumber);

        return block;
      });

    console.timeEnd('time:index-block#getBlocks-ipld-eth-server');
  }

  assert(blockProgressEntities.length, `No blocks fetched for block number ${argv.block}.`);

  for (const partialblockProgress of blockProgressEntities) {
    let blockProgress: BlockProgressInterface;

    // Check if blockProgress fetched from database.
    if (!partialblockProgress.id) {
      [blockProgress] = await indexer.saveBlockAndFetchEvents(partialblockProgress);
    } else {
      blockProgress = partialblockProgress as BlockProgressInterface;
    }

    await processBatchEvents(
      indexer,
      {
        block: blockProgress,
        // TODO: Set ethFullBlock and ethFullTransactions
        ethFullBlock: {} as EthFullBlock,
        ethFullTransactions: []
      },
      { eventsInBatch, subgraphEventsOrder });
  }
};
