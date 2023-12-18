//
// Copyright 2022 Vulcanize, Inc.
//

import * as client from 'prom-client';
import express, { Application } from 'express';
import { createConnection } from 'typeorm';
import debug from 'debug';
import assert from 'assert';
import { ethers } from 'ethers';
import JsonRpcProvider = ethers.providers.JsonRpcProvider;

import { Config } from './config';
import { IndexerInterface } from './types';

const DB_SIZE_QUERY = 'SELECT pg_database_size(current_database())';

const log = debug('vulcanize:metrics');

export async function fetchLatestBlockNumber (provider: JsonRpcProvider): Promise<number> {
  try {
    return await provider.getBlockNumber();
  } catch (err) {
    log('Error fetching latest block number', err);
    return -1;
  }
}

// Create custom metrics
export const jobCount = new client.Gauge({
  name: 'pgboss_jobs_total',
  help: 'Total entries in job table',
  labelNames: ['state', 'name'] as const
});

export const lastJobCompletedOn = new client.Gauge({
  name: 'pgboss_last_job_completed_timestamp_seconds',
  help: 'Last job completed timestamp',
  labelNames: ['name'] as const
});

export const lastProcessedBlockNumber = new client.Gauge({
  name: 'last_processed_block_number',
  help: 'Last processed block number'
});

export const lastBlockProcessDuration = new client.Gauge({
  name: 'last_block_process_duration_seconds',
  help: 'Last block process duration (seconds)'
});

export const lastBlockNumEvents = new client.Gauge({
  name: 'last_block_num_events_total',
  help: 'Number of events in the last block'
});

export const blockProgressCount = new client.Gauge({
  name: 'block_progress_total',
  help: 'Total entries in block_progress table'
});

export const eventCount = new client.Gauge({
  name: 'event_total',
  help: 'Total entries in event table'
});

export const eventProcessingLoadEntityCount = new client.Gauge({
  name: 'event_processing_load_entity_total',
  help: 'Total load entities in a single event processing'
});

export const eventProcessingLoadEntityCacheHitCount = new client.Gauge({
  name: 'event_processing_load_entity_cache_hit_total',
  help: 'Total load entities hitting cache in a single event processing'
});

export const eventProcessingLoadEntityDBQueryDuration = new client.Histogram({
  name: 'event_processing_load_entity_db_query_seconds',
  help: 'Duration of DB query made in event processing'
});

export const cachePrunedEntitiesCount = new client.Gauge({
  name: 'cached_pruned_entities_total',
  help: 'Total entities in pruned region of cache'
});

export const eventProcessingEthCallDuration = new client.Histogram({
  name: 'event_processing_eth_call_duration_seconds',
  help: 'Duration of eth_calls made in event processing'
});

// Export metrics on a server
const app: Application = express();

export const startMetricsServer = async (config: Config, indexer: IndexerInterface): Promise<void> => {
  if (!config.metrics) {
    log('Metrics is disabled. To enable add metrics host and port.');
    return;
  }

  assert(config.metrics.host, 'Missing config for metrics host');
  assert(config.metrics.port, 'Missing config for metrics port');

  // eslint-disable-next-line no-new
  new client.Gauge({
    name: 'sync_status_block_number',
    help: 'Sync status table info',
    labelNames: ['kind'] as const,
    async collect () {
      const syncStatus = await indexer.getSyncStatus();

      if (syncStatus) {
        this.set({ kind: 'latest_indexed' }, syncStatus.latestIndexedBlockNumber);
        this.set({ kind: 'latest_canonical' }, syncStatus.latestCanonicalBlockNumber);
        this.set({ kind: 'chain_head' }, syncStatus.chainHeadBlockNumber);
        this.set({ kind: 'intial_indexed' }, syncStatus.initialIndexedBlockNumber);
      }
    }
  });

  await registerDBSizeMetrics(config);

  await registerUpstreamChainHeadMetrics(config);

  // Collect default metrics
  client.collectDefaultMetrics();

  app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.send(metrics);
  });

  app.listen(config.metrics.port, config.metrics.host, () => {
    log(`Metrics exposed at http://${config.metrics.host}:${config.metrics.port}/metrics`);
  });
};

const registerDBSizeMetrics = async ({ database, jobQueue }: Config): Promise<void> => {
  const [watcherConn, jobQueueConn] = await Promise.all([
    createConnection({
      ...database,
      name: 'metrics-watcher-connection',
      synchronize: false
    }),
    createConnection({
      type: 'postgres',
      url: jobQueue.dbConnectionString,
      name: 'metrics-job-queue-connection',
      synchronize: false
    })
  ]);

  // eslint-disable-next-line no-new
  new client.Gauge({
    name: 'database_size_bytes',
    help: 'Watcher database sizes in bytes',
    labelNames: ['type'] as const,
    async collect () {
      const [
        [{ pg_database_size: watcherDBSize }],
        [{ pg_database_size: jobQueueDBSize }]
      ] = await Promise.all([
        watcherConn.query(DB_SIZE_QUERY),
        jobQueueConn.query(DB_SIZE_QUERY)
      ]);

      this.set({ type: 'watcher' }, Number(watcherDBSize));
      this.set({ type: 'job-queue' }, Number(jobQueueDBSize));
    }
  });
};

const registerUpstreamChainHeadMetrics = async ({ upstream }: Config): Promise<void> => {
  const ethRpcProvider = new JsonRpcProvider(upstream.ethServer.rpcProviderEndpoint);

  // eslint-disable-next-line no-new
  new client.Gauge({
    name: 'latest_upstream_block_number',
    help: 'Latest upstream block number',
    async collect () {
      const latestBlockNumber = await fetchLatestBlockNumber(ethRpcProvider);
      this.set(latestBlockNumber);
    }
  });
};
