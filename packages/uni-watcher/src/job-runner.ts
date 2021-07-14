import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { getConfig, JobQueue } from '@vulcanize/util';

import { Indexer } from './indexer';
import { Database } from './database';
import { UNKNOWN_EVENT_NAME } from './entity/Event';
import { QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING } from './events';

const log = debug('vulcanize:job-runner');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv))
    .option('f', {
      alias: 'config-file',
      demandOption: true,
      describe: 'configuration file path (toml)',
      type: 'string'
    })
    .argv;

  const config = await getConfig(argv.f);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { gqlEndpoint, gqlSubscriptionEndpoint, cache: cacheConfig } = upstream;
  assert(gqlEndpoint, 'Missing upstream gqlEndpoint');
  assert(gqlSubscriptionEndpoint, 'Missing upstream gqlSubscriptionEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({ gqlEndpoint, gqlSubscriptionEndpoint, cache });

  const indexer = new Indexer(config, db, ethClient);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLag } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag });
  await jobQueue.start();

  await jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
    const { data: { blockHash, blockNumber } } = job;

    log(`Processing block ${blockHash} ${blockNumber}`);

    const events = await indexer.getOrFetchBlockEvents(blockHash);
    for (let ei = 0; ei < events.length; ei++) {
      const { blockHash, id } = events[ei];
      await jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { blockHash, id, publish: true });
    }

    await jobQueue.markComplete(job);
  });

  await jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
    const { data: { id } } = job;

    log(`Processing event ${id}`);

    let dbEvent = await indexer.getEvent(id);
    assert(dbEvent);

    const uniContract = await indexer.isUniswapContract(dbEvent.contract);
    if (uniContract) {
      // We might not have parsed this event yet. This can happen if the contract was added
      // as a result of a previous event in the same block.
      if (dbEvent.eventName === UNKNOWN_EVENT_NAME) {
        const logObj = JSON.parse(dbEvent.extraInfo);
        const { eventName, eventInfo } = indexer.parseEventNameAndArgs(uniContract.kind, logObj);
        dbEvent.eventName = eventName;
        dbEvent.eventInfo = JSON.stringify(eventInfo);
        dbEvent = await indexer.saveEventEntity(dbEvent);
      }

      await indexer.processEvent(dbEvent);
    }

    await jobQueue.markComplete(job);
  });
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});
