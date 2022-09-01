//
// Copyright 2022 Vulcanize, Inc.
//

import * as client from 'prom-client';
import express, { Application } from 'express';
import debug from 'debug';
import assert from 'assert';

import { Config } from './config';

const log = debug('vulcanize:gql-metrics');

const gqlRegistry = new client.Registry();

// Create custom metrics
export const gqlTotalQueryCount = new client.Counter({
  name: 'gql_query_count_total',
  help: 'Total GQL queries made',
  registers: [gqlRegistry]
});

export const gqlQueryCount = new client.Counter({
  name: 'gql_query_count',
  help: 'GQL queries made',
  labelNames: ['name'] as const,
  registers: [gqlRegistry]
});

// Export metrics on a server
const app: Application = express();

export const startGQLMetricsServer = async (config: Config): Promise<void> => {
  if (!config.metrics || !config.metrics.gql) {
    log('GQL metrics disabled. To enable add GQL metrics host and port.');
    return;
  }

  assert(config.metrics.host, 'Missing config for metrics host');
  assert(config.metrics.gql.port, 'Missing config for gql metrics port');

  app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', gqlRegistry.contentType);
    const metrics = await gqlRegistry.metrics();
    res.send(metrics);
  });

  app.listen(config.metrics.gql.port, config.metrics.host, () => {
    log(`GQL Metrics exposed at http://${config.metrics.host}:${config.metrics.gql.port}/metrics`);
  });
};
