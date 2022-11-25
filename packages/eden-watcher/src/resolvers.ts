//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import Decimal from 'decimal.js';
import { GraphQLResolveInfo, GraphQLScalarType } from 'graphql';

import { BlockHeight, OrderDirection, gqlTotalQueryCount, gqlQueryCount, jsonBigIntStringReplacer, getResultState, setGQLCacheHints, IndexerInterface, EventWatcher } from '@cerc-io/util';

import { Indexer } from './indexer';
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

export const createResolvers = async (indexerArg: IndexerInterface, eventWatcher: EventWatcher): Promise<any> => {
  const indexer = indexerArg as Indexer;

  const gqlCacheConfig = indexer.serverConfig.gqlCache;

  return {
    BigInt: new BigInt('bigInt'),

    BigDecimal: new GraphQLScalarType({
      name: 'BigDecimal',
      description: 'BigDecimal custom scalar type',
      parseValue (value) {
        // value from the client
        return new Decimal(value);
      },
      serialize (value: Decimal) {
        // value sent to the client
        return value.toFixed();
      }
    }),

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
      watchContract: async (_: any, { address, kind, checkpoint, startingBlock = 1 }: { address: string, kind: string, checkpoint: boolean, startingBlock: number }): Promise<boolean> => {
        log('watchContract', address, kind, checkpoint, startingBlock);
        await indexer.watchContract(address, kind, checkpoint, startingBlock);

        return true;
      }
    },

    Query: {
      producer: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('producer', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('producer').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Producer, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      producers: async (
        _: any,
        { block = {}, first, skip }: { block: BlockHeight, first: number, skip: number },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('producers', JSON.stringify(block, jsonBigIntStringReplacer), first, skip);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('producers').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntities(
          Producer,
          block,
          {},
          { limit: first, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      producerSet: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('producerSet', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('producerSet').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(ProducerSet, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      producerSetChange: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('producerSetChange', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('producerSetChange').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(ProducerSetChange, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      producerRewardCollectorChange: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('producerRewardCollectorChange', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('producerRewardCollectorChange').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(ProducerRewardCollectorChange, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      rewardScheduleEntry: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('rewardScheduleEntry', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('rewardScheduleEntry').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(RewardScheduleEntry, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      rewardSchedule: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('rewardSchedule', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('rewardSchedule').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(RewardSchedule, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      producerEpoch: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('producerEpoch', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('producerEpoch').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(ProducerEpoch, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      block: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('block', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('block').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Block, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      blocks: async (
        _: any,
        { block = {}, where, first, skip, orderBy, orderDirection }: { block: BlockHeight, where: { [key: string]: any }, first: number, skip: number, orderBy: string, orderDirection: OrderDirection },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('blocks', JSON.stringify(block, jsonBigIntStringReplacer), JSON.stringify(where, jsonBigIntStringReplacer), first, skip, orderBy, orderDirection);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('blocks').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntities(
          Block,
          block,
          where,
          { limit: first, skip, orderBy, orderDirection },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      epoch: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('epoch', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('epoch').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Epoch, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      epoches: async (
        _: any,
        { block = {}, where, first, skip }: { block: BlockHeight, where: { [key: string]: any }, first: number, skip: number },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('epoches', JSON.stringify(block, jsonBigIntStringReplacer), JSON.stringify(where, jsonBigIntStringReplacer), first, skip);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('epoches').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntities(
          Epoch,
          block,
          where,
          { limit: first, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      slotClaim: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('slotClaim', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('slotClaim').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(SlotClaim, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      slot: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('slot', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('slot').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Slot, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      staker: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('staker', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('staker').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Staker, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      stakers: async (
        _: any,
        { block = {}, where, first, skip, orderBy, orderDirection }: { block: BlockHeight, where: { [key: string]: any }, first: number, skip: number, orderBy: string, orderDirection: OrderDirection },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('stakers', JSON.stringify(block, jsonBigIntStringReplacer), JSON.stringify(where, jsonBigIntStringReplacer), first, skip, orderBy, orderDirection);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('stakers').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntities(
          Staker,
          block,
          where,
          { limit: first, skip, orderBy, orderDirection },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      network: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('network', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('network').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Network, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      distributor: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('distributor', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('distributor').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getSubgraphEntity(Distributor, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      distribution: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('distribution', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('distribution').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Distribution, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      claim: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('claim', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('claim').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Claim, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      slash: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('slash', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('slash').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Slash, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      account: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('account', id, JSON.stringify(block, jsonBigIntStringReplacer));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('account').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        // Set cache-control hints
        setGQLCacheHints(info, block, gqlCacheConfig);

        return indexer.getSubgraphEntity(Account, id, block, info.fieldNodes[0].selectionSet.selections);
      },

      events: async (_: any, { blockHash, contractAddress, name }: { blockHash: string, contractAddress: string, name?: string }) => {
        log('events', blockHash, contractAddress, name);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('events').inc(1);

        const block = await indexer.getBlockProgress(blockHash);
        if (!block || !block.isComplete) {
          throw new Error(`Block hash ${blockHash} number ${block?.blockNumber} not processed yet`);
        }

        const events = await indexer.getEventsByFilter(blockHash, contractAddress, name);
        return events.map(event => indexer.getResultEvent(event));
      },

      eventsInRange: async (_: any, { fromBlockNumber, toBlockNumber }: { fromBlockNumber: number, toBlockNumber: number }) => {
        log('eventsInRange', fromBlockNumber, toBlockNumber);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('eventsInRange').inc(1);

        const { expected, actual } = await indexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
        if (expected !== actual) {
          throw new Error(`Range not available, expected ${expected}, got ${actual} blocks in range`);
        }

        const events = await indexer.getEventsInRange(fromBlockNumber, toBlockNumber);
        return events.map(event => indexer.getResultEvent(event));
      },

      getStateByCID: async (_: any, { cid }: { cid: string }) => {
        log('getStateByCID', cid);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getStateByCID').inc(1);

        const state = await indexer.getStateByCID(cid);

        return state && state.block.isComplete ? getResultState(state) : undefined;
      },

      getState: async (_: any, { blockHash, contractAddress, kind }: { blockHash: string, contractAddress: string, kind: string }) => {
        log('getState', blockHash, contractAddress, kind);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getState').inc(1);

        const state = await indexer.getPrevState(blockHash, contractAddress, kind);

        return state && state.block.isComplete ? getResultState(state) : undefined;
      },

      getSyncStatus: async () => {
        log('getSyncStatus');
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getSyncStatus').inc(1);

        return indexer.getSyncStatus();
      }
    }
  };
};
