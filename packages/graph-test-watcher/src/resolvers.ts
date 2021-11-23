//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { ValueResult, BlockHeight } from '@vulcanize/util';

import { Indexer } from './indexer';
import { EventWatcher } from './events';

import { ExampleEntity } from './entity/ExampleEntity';
import { RelatedEntity } from './entity/RelatedEntity';
import { ManyRelatedEntity } from './entity/ManyRelatedEntity';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexer: Indexer, eventWatcher: EventWatcher): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    Event: {
      __resolveType: (obj: any) => {
        assert(obj.__typename);

        return obj.__typename;
      }
    },

    Subscription: {
      onEvent: {
        subscribe: () => eventWatcher.getEventIterator()
      }
    },

    Mutation: {
      watchContract: (_: any, { address, kind, checkpoint, startingBlock }: { address: string, kind: string, checkpoint: boolean, startingBlock: number }): Promise<boolean> => {
        log('watchContract', address, kind, checkpoint, startingBlock);

        return indexer.watchContract(address, kind, checkpoint, startingBlock);
      }
    },

    Query: {
      getMethod: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('getMethod', blockHash, contractAddress);
        return indexer.getMethod(blockHash, contractAddress);
      },

      _test: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('_test', blockHash, contractAddress);
        return indexer._test(blockHash, contractAddress);
      },

      relatedEntity: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }): Promise<RelatedEntity | undefined> => {
        log('relatedEntity', id, block);

        return indexer.getSubgraphEntity(RelatedEntity, id, block.hash);
      },

      manyRelatedEntity: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }): Promise<ManyRelatedEntity | undefined> => {
        log('relatedEntity', id, block);

        return indexer.getSubgraphEntity(ManyRelatedEntity, id, block.hash);
      },

      exampleEntity: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }): Promise<ExampleEntity | undefined> => {
        log('exampleEntity', id, block);

        return indexer.getSubgraphEntity(ExampleEntity, id, block.hash);
      },

      events: async (_: any, { blockHash, contractAddress, name }: { blockHash: string, contractAddress: string, name?: string }) => {
        log('events', blockHash, contractAddress, name);

        const block = await indexer.getBlockProgress(blockHash);
        if (!block || !block.isComplete) {
          throw new Error(`Block hash ${blockHash} number ${block?.blockNumber} not processed yet`);
        }

        const events = await indexer.getEventsByFilter(blockHash, contractAddress, name);
        return events.map(event => indexer.getResultEvent(event));
      },

      eventsInRange: async (_: any, { fromBlockNumber, toBlockNumber }: { fromBlockNumber: number, toBlockNumber: number }) => {
        log('eventsInRange', fromBlockNumber, toBlockNumber);

        const { expected, actual } = await indexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
        if (expected !== actual) {
          throw new Error(`Range not available, expected ${expected}, got ${actual} blocks in range`);
        }

        const events = await indexer.getEventsInRange(fromBlockNumber, toBlockNumber);
        return events.map(event => indexer.getResultEvent(event));
      },

      getStateByCID: async (_: any, { cid }: { cid: string }) => {
        log('getStateByCID', cid);

        const ipldBlock = await indexer.getIPLDBlockByCid(cid);

        return ipldBlock && ipldBlock.block.isComplete ? indexer.getResultIPLDBlock(ipldBlock) : undefined;
      },

      getState: async (_: any, { blockHash, contractAddress, kind = 'diff' }: { blockHash: string, contractAddress: string, kind: string }) => {
        log('getState', blockHash, contractAddress, kind);

        const ipldBlock = await indexer.getPrevIPLDBlock(blockHash, contractAddress, kind);

        return ipldBlock && ipldBlock.block.isComplete ? indexer.getResultIPLDBlock(ipldBlock) : undefined;
      }
    }
  };
};
