//
// Copyright 2023 Vulcanize, Inc.
//

import debug from 'debug';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';

const log = debug('laconic:proxy');

interface Arguments {
  port: number;
  upstream: string;
  originHeader?: string;
}

async function main (): Promise<void> {
  const argv: Arguments = _getArgv();

  const app = express();

  // Enable CORS
  app.use(cors());

  const upstreamEndpoint: string = argv.upstream;
  if (!upstreamEndpoint) {
    throw new Error('Upstream endpoint not provided');
  }

  // Create a proxy
  const proxyMiddleware = createProxyMiddleware({
    target: upstreamEndpoint,
    changeOrigin: true, // Enable CORS bypass
    logLevel: 'debug', // Set log level as needed
    onProxyReq: (proxyReq) => {
      if (argv.originHeader) {
        proxyReq.setHeader('Origin', argv.originHeader);
      }
    }
  });

  // Use the proxy middleware for incoming requests
  app.use('/', proxyMiddleware);

  // Start the server
  app.listen(argv.port, () => {
    log(`Proxy server listening on port ${argv.port}`);
  });
}

function _getArgv (): any {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).env(
    'PROXY'
  ).options({
    port: {
      type: 'number',
      describe: 'Port to listen on (env: PROXY_PORT)',
      default: 4000
    },
    upstream: {
      type: 'string',
      describe: 'Upstream endpoint (env: PROXY_UPSTREAM)',
      demandOption: true
    },
    originHeader: {
      type: 'string',
      describe: 'Origin header to be used (env: PROXY_ORIGIN_HEADER)'
    }
  }).argv;
}

main().catch(err => {
  log(err);
});
