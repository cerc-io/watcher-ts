//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { BlockHeight } from '@vulcanize/util';

import { Indexer } from './indexer';
import { EventWatcher } from './events';

import { Producer } from './entity/Producer';
import { ProducerSet } from './entity/ProducerSet';
import { ProducerSetChange } from './entity/ProducerSetChange';
import { ProducerRewardCollectorChange } from './entity/ProducerRewardCollectorChange';
import { RewardScheduleEntry } from './entity/RewardScheduleEntry';
import { RewardSchedule } from './entity/RewardSchedule';
import { ProducerEpoch } from './entity/ProducerEpoch';
import { Block } from './entity/Block';
import { Epoch } from './entity/Epoch';
import { SlotClaim } from './entity/SlotClaim';
import { Slot } from './entity/Slot';
import { Staker } from './entity/Staker';
import { Network } from './entity/Network';
import { Distributor } from './entity/Distributor';
import { Distribution } from './entity/Distribution';
import { Claim } from './entity/Claim';
import { Slash } from './entity/Slash';
import { Account } from './entity/Account';

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
      producer: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('producer', id, block);

        return indexer.getSubgraphEntity(Producer, id, block.hash);
      },

      producerSet: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('producerSet', id, block);

        return indexer.getSubgraphEntity(ProducerSet, id, block.hash);
      },

      producerSetChange: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('producerSetChange', id, block);

        return indexer.getSubgraphEntity(ProducerSetChange, id, block.hash);
      },

      producerRewardCollectorChange: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('producerRewardCollectorChange', id, block);

        return indexer.getSubgraphEntity(ProducerRewardCollectorChange, id, block.hash);
      },

      rewardScheduleEntry: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('rewardScheduleEntry', id, block);

        return indexer.getSubgraphEntity(RewardScheduleEntry, id, block.hash);
      },

      rewardSchedule: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('rewardSchedule', id, block);

        return indexer.getSubgraphEntity(RewardSchedule, id, block.hash);
      },

      producerEpoch: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('producerEpoch', id, block);

        return indexer.getSubgraphEntity(ProducerEpoch, id, block.hash);
      },

      block: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('block', id, block);

        return indexer.getSubgraphEntity(Block, id, block.hash);
      },

      epoch: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('epoch', id, block);

        return indexer.getSubgraphEntity(Epoch, id, block.hash);
      },

      slotClaim: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('slotClaim', id, block);

        return indexer.getSubgraphEntity(SlotClaim, id, block.hash);
      },

      slot: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('slot', id, block);

        return indexer.getSubgraphEntity(Slot, id, block.hash);
      },

      staker: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('staker', id, block);

        return indexer.getSubgraphEntity(Staker, id, block.hash);
      },

      network: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('network', id, block);

        return indexer.getSubgraphEntity(Network, id, block.hash);
      },

      distributor: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('distributor', id, block);

        return indexer.getSubgraphEntity(Distributor, id, block.hash);
      },

      distribution: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('distribution', id, block);

        return indexer.getSubgraphEntity(Distribution, id, block.hash);
      },

      claim: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('claim', id, block);

        return indexer.getSubgraphEntity(Claim, id, block.hash);
      },

      slash: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('slash', id, block);

        return indexer.getSubgraphEntity(Slash, id, block.hash);
      },

      account: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('account', id, block);

        return indexer.getSubgraphEntity(Account, id, block.hash);
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
