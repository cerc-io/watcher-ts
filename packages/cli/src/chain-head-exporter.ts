//
// Copyright 2023 Vulcanize, Inc.
//

import express from 'express';
import axios from 'axios';
import * as promClient from 'prom-client';
import debug from 'debug';

const log = debug('laconic:chain-head-exporter');

async function fetchLatestEthereumBlockNumber (apiKey?: string): Promise<number> {
  if (!apiKey) {
    return -1;
  }

  try {
    const response = await axios.get(`https://api.etherscan.io/api?module=proxy&action=eth_blockNumber&apikey=${apiKey}`);
    return parseInt(response.data.result, 16);
  } catch (err) {
    log('Error fetching latest block number from Etherscan:', err);
    return -1;
  }
}

async function fetchLatestFilecoinBlockNumber (): Promise<number> {
  try {
    const response = await axios.post('https://api.node.glif.io/rpc/v1', {
      jsonrpc: '2.0',
      method: 'Filecoin.ChainHead',
      params: null,
      id: 1
    });
    return Number(response.data.result.Height);
  } catch (err) {
    log('Error fetching latest block number from Filecoin Glif Node:', err);
    return -1;
  }
}

async function main (): Promise<void> {
  const app = express();

  const etherscanAPIKey = process.env.ETHERSCAN_API_KEY;
  if (!etherscanAPIKey) {
    log('WARNING: ETHERSCAN_API_KEY not set');
  }

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
        fetchLatestEthereumBlockNumber(etherscanAPIKey),
        fetchLatestFilecoinBlockNumber()
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

  const PORT = 5000;
  app.listen(PORT, () => {
    log(`Server running on port ${PORT}`);
  });
}

main().catch(err => {
  log(err);
});
