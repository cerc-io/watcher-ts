//
// Copyright 2022 Vulcanize, Inc.
//

import { utils, providers, errors } from 'ethers';
import debug from 'debug';

import { NULL_BLOCK_ERROR } from './constants';

const log = debug('vulcanize:block-size-cache');

// Number of blocks to cache after current block being processed.
const BLOCK_SIZE_CACHE_BUFFER = 10;
// Block height interval at which blockSizeMap is cleared.
// If the block being processed is divisible by BLOCK_SIZE_MAP_CLEAR_HEIGHT_INTERVAL then blocks below that height are removed from the map.
const BLOCK_SIZE_MAP_CLEAR_HEIGHT_INTERVAL = 50;

const blockSizeMap: Map<string, { size: string, blockNumber: number }> = new Map();
let blockSizeMapLatestHeight = -1;

export const getCachedBlockSize = async (provider: providers.JsonRpcProvider, blockHash: string, blockNumber: number): Promise<string> => {
  const block = blockSizeMap.get(blockHash);
  cacheBlockSizesAsync(provider, blockNumber);

  if (!block) {
    console.time(`time:misc#getCachedBlockSize-eth_getBlockByHash-${blockNumber}`);
    const { size } = await provider.send('eth_getBlockByHash', [blockHash, false]);
    console.timeEnd(`time:misc#getCachedBlockSize-eth_getBlockByHash-${blockNumber}`);

    return size;
  }

  return block.size;
};

const cacheBlockSizesAsync = async (provider: providers.JsonRpcProvider, blockNumber: number): Promise<void> => {
  const endBlockHeight = blockNumber + BLOCK_SIZE_CACHE_BUFFER;

  if (blockSizeMapLatestHeight < 0) {
    blockSizeMapLatestHeight = blockNumber;
  }

  if (endBlockHeight > blockSizeMapLatestHeight) {
    const startBlockHeight = Math.max(blockNumber, blockSizeMapLatestHeight + 1);
    blockSizeMapLatestHeight = endBlockHeight;

    // Start prefetching blocks after latest height in blockSizeMap.
    for (let i = startBlockHeight; i <= endBlockHeight; i++) {
      try {
        console.time(`time:misc#cacheBlockSizesAsync-eth_getBlockByNumber-${i}`);
        const block = await provider.send('eth_getBlockByNumber', [utils.hexStripZeros(utils.hexlify(i)), false]);

        if (block) {
          const { size, hash } = block;
          blockSizeMap.set(hash, { size, blockNumber: i });
        } else {
          log(`No block found at height ${i}`);
        }
      } catch (err: any) {
        // Handle null block error in case of Lotus EVM
        if (!(err.code === errors.SERVER_ERROR && err.error && err.error.message === NULL_BLOCK_ERROR)) {
          throw err;
        }

        log(`Block ${i} requested was null (FEVM); Fetching next block`);
      } finally {
        console.timeEnd(`time:misc#cacheBlockSizesAsync-eth_getBlockByNumber-${i}`);
      }
    }
  }

  // At interval clear previous blocks below height blockNumber from map.
  if (blockNumber % BLOCK_SIZE_MAP_CLEAR_HEIGHT_INTERVAL === 0) {
    log(`cacheBlockSizesAsync-clear-map-below-${blockNumber}`);
    const previousBlockHashes = Array.from(blockSizeMap.entries())
      .filter(([, value]) => value.blockNumber <= blockNumber)
      .map(([blockHash]) => blockHash);

    previousBlockHashes.forEach(blockHash => blockSizeMap.delete(blockHash));
  }
};
