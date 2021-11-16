//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

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
      producer: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Producer | undefined> => {
        log('producer', id, blockHash);

        return indexer.getSubgraphEntity(Producer, id, blockHash);
      },

      producerSet: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<ProducerSet | undefined> => {
        log('producerSet', id, blockHash);

        return indexer.getSubgraphEntity(ProducerSet, id, blockHash);
      },

      producerSetChange: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<ProducerSetChange | undefined> => {
        log('producerSetChange', id, blockHash);

        return indexer.getSubgraphEntity(ProducerSetChange, id, blockHash);
      },

      producerRewardCollectorChange: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<ProducerRewardCollectorChange | undefined> => {
        log('producerRewardCollectorChange', id, blockHash);

        return indexer.getSubgraphEntity(ProducerRewardCollectorChange, id, blockHash);
      },

      rewardScheduleEntry: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<RewardScheduleEntry | undefined> => {
        log('rewardScheduleEntry', id, blockHash);

        return indexer.getSubgraphEntity(RewardScheduleEntry, id, blockHash);
      },

      rewardSchedule: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<RewardSchedule | undefined> => {
        log('rewardSchedule', id, blockHash);

        return indexer.getSubgraphEntity(RewardSchedule, id, blockHash);
      },

      producerEpoch: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<ProducerEpoch | undefined> => {
        log('producerEpoch', id, blockHash);

        return indexer.getSubgraphEntity(ProducerEpoch, id, blockHash);
      },

      block: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Block | undefined> => {
        log('block', id, blockHash);

        return indexer.getSubgraphEntity(Block, id, blockHash);
      },

      epoch: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Epoch | undefined> => {
        log('epoch', id, blockHash);

        return indexer.getSubgraphEntity(Epoch, id, blockHash);
      },

      slotClaim: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<SlotClaim | undefined> => {
        log('slotClaim', id, blockHash);

        return indexer.getSubgraphEntity(SlotClaim, id, blockHash);
      },

      slot: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Slot | undefined> => {
        log('slot', id, blockHash);

        return indexer.getSubgraphEntity(Slot, id, blockHash);
      },

      staker: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Staker | undefined> => {
        log('staker', id, blockHash);

        return indexer.getSubgraphEntity(Staker, id, blockHash);
      },

      network: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Network | undefined> => {
        log('network', id, blockHash);

        return indexer.getSubgraphEntity(Network, id, blockHash);
      },

      distributor: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Distributor | undefined> => {
        log('distributor', id, blockHash);

        return indexer.getSubgraphEntity(Distributor, id, blockHash);
      },

      distribution: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Distribution | undefined> => {
        log('distribution', id, blockHash);

        return indexer.getSubgraphEntity(Distribution, id, blockHash);
      },

      claim: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Claim | undefined> => {
        log('claim', id, blockHash);

        return indexer.getSubgraphEntity(Claim, id, blockHash);
      },

      slash: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Slash | undefined> => {
        log('slash', id, blockHash);

        return indexer.getSubgraphEntity(Slash, id, blockHash);
      },

      account: async (_: any, { id, blockHash }: { id: string, blockHash: string }): Promise<Account | undefined> => {
        log('account', id, blockHash);

        return indexer.getSubgraphEntity(Account, id, blockHash);
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
