//
// Copyright 2023 Vulcanize, Inc.
//

import express from 'express';
import axios from 'axios';
import * as promClient from 'prom-client';
import debug from 'debug';

const log = debug('laconic:chain-head-exporter');

// Env overrides:
// ETH_RPC_ENDPOINT - Ethereum RPC API endpoint
// ETH_RPC_API_KEY  - Ethereum RPC API endpoint key
// FIL_RPC_ENDPOINT - Filecoin RPC API endpoint
// PORT             - Metrics server listening port

// Defaults
const DEFAULT_ETH_RPC_ENDPOINT = 'https://mainnet.infura.io/v3';
const DEFAULT_FIL_RPC_ENDPOINT = 'https://api.node.glif.io/rpc/v1';
const DEFAULT_PORT = 5000;

async function fetchLatestBlockNumber (jsonRpcUrl: string): Promise<number> {
  try {
    const response = await axios.post(jsonRpcUrl, {
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1
    });
    return parseInt(response.data.result, 16);
  } catch (err) {
    log(`Error fetching latest block number from URL ${jsonRpcUrl}:`, err);
    return -1;
  }
}

async function main (): Promise<void> {
  const app = express();

  const ethRpcApiKey = process.env.ETH_RPC_API_KEY;
  if (!ethRpcApiKey) {
    log('WARNING: ETH_RPC_API_KEY not set');
  }
  const ethUrlSuffix = ethRpcApiKey ? `/${ethRpcApiKey}` : '';

  // eslint-disable-next-line no-new
  new promClient.Gauge({
    name: 'latest_block_number',
    help: 'Latest block number / height from various block chains',
    labelNames: ['chain'] as const,
    async collect () {
      const [
        latestEthBlockNumber,
        latestFilBlockNumber
      ] = await Promise.all([
        fetchLatestBlockNumber(`${process.env.ETH_RPC_ENDPOINT ?? DEFAULT_ETH_RPC_ENDPOINT}${ethUrlSuffix}`),
        fetchLatestBlockNumber(process.env.FILECOIN_RPC_ENDPOINT ?? DEFAULT_FIL_RPC_ENDPOINT)
      ]);

      this.set({ chain: 'ethereum' }, latestEthBlockNumber);
      this.set({ chain: 'filecoin' }, latestFilBlockNumber);
    }
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    const metrics = await promClient.register.metrics();
    res.send(metrics);
  });

  const port = process.env.PORT ?? DEFAULT_PORT;
  app.listen(port, () => {
    log(`Server running on port ${port}`);
  });
}

main().catch(err => {
  log(err);
});
