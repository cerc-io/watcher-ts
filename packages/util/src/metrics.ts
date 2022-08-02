import * as client from 'prom-client';
import express, { Application } from 'express';

import { MetricsConfig } from './config';

// Create custom metrics
export const jobCount = new client.Gauge({
  name: 'pgboss_jobs_total',
  help: 'Total entries in job table',
  labelNames: ['state', 'name'] as const
});

export const lastJobCreatedOn = new client.Gauge({
  name: 'pgboss_last_job_created_timestamp_seconds',
  help: 'Last job created timestamp',
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

// Export metrics on a server
const app: Application = express();

export async function startMetricsServer ({ host, port }: MetricsConfig): Promise<void> {
  // Collect default metrics
  client.collectDefaultMetrics();

  app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.send(metrics);
  });

  app.listen(port, () => {
    console.log(`Metrics exposed at http://${host}:${port}/metrics`);
  });
}
