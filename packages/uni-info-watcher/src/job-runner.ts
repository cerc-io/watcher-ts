import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { getConfig, JobQueue } from '@vulcanize/util';

import { Indexer } from './indexer';
import { Database } from './database';
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
  const { uniWatcher: { gqlEndpoint, gqlSubscriptionEndpoint }, tokenWatcher } = upstream;
  assert(gqlEndpoint, 'Missing upstream uniWatcher.gqlEndpoint');
  assert(gqlSubscriptionEndpoint, 'Missing upstream uniWatcher.gqlSubscriptionEndpoint');

  const uniClient = new UniClient({
    gqlEndpoint,
    gqlSubscriptionEndpoint
  });

  const erc20Client = new ERC20Client(tokenWatcher);

  const indexer = new Indexer(db, uniClient, erc20Client);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLag } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag });
  await jobQueue.start();

  await jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
    const { data: { block } } = job;
    log(`Processing block hash ${block.hash} number ${block.number}`);
    const events = await indexer.getOrFetchBlockEvents(block);

    for (let ei = 0; ei < events.length; ei++) {
      const { id } = events[ei];
      await jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { id });
    }

    await jobQueue.markComplete(job);
  });

  await jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
    const { data: { id } } = job;

    log(`Processing event ${id}`);
    const dbEvent = await db.getEvent(id);
    assert(dbEvent);

    if (!dbEvent.block.isComplete) {
      await indexer.processEvent(dbEvent);
      await indexer.updateBlockProgress(dbEvent.block.blockHash);
    }

    await jobQueue.markComplete(job);
  });
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});
