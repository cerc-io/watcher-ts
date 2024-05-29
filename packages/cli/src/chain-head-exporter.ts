//
// Copyright 2023 Vulcanize, Inc.
//

import express from 'express';
import * as promClient from 'prom-client';
import debug from 'debug';
import { ethers } from 'ethers';
import JsonRpcProvider = ethers.providers.JsonRpcProvider;

const log = debug('laconic:chain-head-exporter');

// Env overrides:
// ETH_RPC_ENDPOINT - Ethereum RPC API endpoint
// ETH_RPC_API_KEY  - Ethereum RPC API endpoint key
// PORT             - Metrics server listening port

// Defaults
const DEFAULT_ETH_RPC_ENDPOINT = 'https://mainnet.infura.io/v3';
const DEFAULT_PORT = 5000;

async function main (): Promise<void> {
  const app = express();
  const metricsRegister = new promClient.Registry();

  const ethRpcBaseUrl = process.env.ETH_RPC_ENDPOINT || DEFAULT_ETH_RPC_ENDPOINT;

  const ethRpcApiKey = process.env.ETH_RPC_API_KEY;
  if (!ethRpcApiKey) {
    log('WARNING: ETH_RPC_API_KEY not set');
  }

  const ethUrlSuffix = ethRpcApiKey ? `/${ethRpcApiKey}` : '';
  const ethRpcUrl = `${ethRpcBaseUrl}${ethUrlSuffix}`;
  let ethProvider: JsonRpcProvider;
  try {
    ethProvider = new JsonRpcProvider(ethRpcUrl);
  } catch (err) {
    log(`Error creating ETH RPC provider from URL ${ethRpcBaseUrl}`, err);
  }

  // eslint-disable-next-line no-new
  new promClient.Gauge({
    name: 'latest_block_number',
    help: 'Latest block number / height from various block chains',
    registers: [metricsRegister],
    labelNames: ['chain'] as const,
    async collect () {
      try {
        const latestEthBlockNumber = await ethProvider.getBlockNumber();
        this.set(latestEthBlockNumber);
      } catch (err) {
        log('Error fetching latest block number', err);
      }
    }
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metricsRegister.contentType);
    const metrics = await metricsRegister.metrics();
    res.send(metrics);
  });

  const port = Number(process.env.PORT) || DEFAULT_PORT;
  app.listen(port, () => {
    log(`Server running on port ${port}`);
  });
}

main().catch(err => {
  log(err);
});
