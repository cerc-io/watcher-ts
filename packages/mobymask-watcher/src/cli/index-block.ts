//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import 'reflect-metadata';
import debug from 'debug';
import assert from 'assert';

import { Config, DEFAULT_CONFIG_PATH, getConfig, initClients, JobQueue, OrderDirection, UNKNOWN_EVENT_NAME } from '@vulcanize/util';

import { Database } from '../database';
import { Indexer } from '../indexer';
import { BlockProgress } from '../entity/BlockProgress';
import { Event } from '../entity/Event';

const DEFAULT_EVENTS_IN_BATCH = 50;

const log = debug('vulcanize:watch-contract');

const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'f',
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
    },
    block: {
      type: 'number',
      require: true,
      demandOption: true,
      describe: 'Block number to index'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue);
  await indexer.init();

  let blockProgressEntities: Partial<BlockProgress>[] = await indexer.getBlocksAtHeight(argv.block, false);

  if (!blockProgressEntities.length) {
    console.time('time:index-block#getBlocks-ipld-eth-server');
    const blocks = await indexer.getBlocks({ blockNumber: argv.block });

    blockProgressEntities = blocks.map((block: any): Partial<BlockProgress> => {
      block.blockTimestamp = block.timestamp;

      return block;
    });

    console.timeEnd('time:index-block#getBlocks-ipld-eth-server');
  }

  assert(blockProgressEntities.length, `No blocks fetched for block number ${argv.block}.`);

  for (let blockProgress of blockProgressEntities) {
    // Check if blockProgress fetched from database.
    if (!blockProgress.id) {
      blockProgress = await indexer.fetchBlockEvents(blockProgress);
    }

    assert(blockProgress instanceof BlockProgress);
    assert(indexer.processBlock);
    await indexer.processBlock(blockProgress.blockHash, blockProgress.blockNumber);

    // Check if block has unprocessed events.
    if (blockProgress.numProcessedEvents < blockProgress.numEvents) {
      while (!blockProgress.isComplete) {
        console.time('time:index-block#fetching_events_batch');

        // Fetch events in batches
        const events = await indexer.getBlockEvents(
          blockProgress.blockHash,
          {
            index: [
              { value: blockProgress.lastProcessedEventIndex + 1, operator: 'gte', not: false }
            ]
          },
          {
            limit: jobQueueConfig.eventsInBatch || DEFAULT_EVENTS_IN_BATCH,
            orderBy: 'index',
            orderDirection: OrderDirection.asc
          }
        );

        console.timeEnd('time:index-block#fetching_events_batch');

        if (events.length) {
          log(`Processing events batch from index ${events[0].index} to ${events[0].index + events.length - 1}`);
        }

        console.time('time:index-block#processEvents-processing_events_batch');

        for (const event of events) {
          // Process events in loop
          await processEvent(indexer, blockProgress, event);
        }

        console.timeEnd('time:index-block#processEvents-processing_events_batch');
      }
    }
  }

  await db.close();
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});

/**
 * Process individual event from database.
 * @param indexer
 * @param block
 * @param event
 */
const processEvent = async (indexer: Indexer, block: BlockProgress, event: Event) => {
  const eventIndex = event.index;

  // Check if previous event in block has been processed exactly before this and abort if not.
  if (eventIndex > 0) { // Skip the first event in the block.
    const prevIndex = eventIndex - 1;

    if (prevIndex !== block.lastProcessedEventIndex) {
      throw new Error(`Events received out of order for block number ${block.blockNumber} hash ${block.blockHash},` +
      ` prev event index ${prevIndex}, got event index ${event.index} and lastProcessedEventIndex ${block.lastProcessedEventIndex}, aborting`);
    }
  }

  let watchedContract;

  if (!indexer.isWatchedContract) {
    watchedContract = true;
  } else {
    watchedContract = await indexer.isWatchedContract(event.contract);
  }

  if (watchedContract) {
    // We might not have parsed this event yet. This can happen if the contract was added
    // as a result of a previous event in the same block.
    if (event.eventName === UNKNOWN_EVENT_NAME) {
      const logObj = JSON.parse(event.extraInfo);

      assert(indexer.parseEventNameAndArgs);
      assert(typeof watchedContract !== 'boolean');
      const { eventName, eventInfo } = indexer.parseEventNameAndArgs(watchedContract.kind, logObj);

      event.eventName = eventName;
      event.eventInfo = JSON.stringify(eventInfo);
      event = await indexer.saveEventEntity(event);
    }

    await indexer.processEvent(event);
  }

  block = await indexer.updateBlockProgress(block, event.index);
};
