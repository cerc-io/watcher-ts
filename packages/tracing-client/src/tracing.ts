//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { ethers } from 'ethers';

const callTracerWithAddresses = fs.readFileSync(path.join(__dirname, 'tracers', 'call_address_tracer.js')).toString('utf-8');

export class TracingClient {
  _providerUrl: string;
  _provider: ethers.providers.JsonRpcProvider;

  constructor (providerUrl: string) {
    assert(providerUrl);

    this._providerUrl = providerUrl;
    this._provider = new ethers.providers.JsonRpcProvider(providerUrl);
  }

  async getTx (txHash: string): Promise<ethers.providers.TransactionResponse> {
    return this._provider.getTransaction(txHash);
  }

  async getTxTrace (txHash: string, tracer: string | undefined, timeout: string | undefined): Promise<any> {
    if (tracer === 'callTraceWithAddresses') {
      tracer = callTracerWithAddresses;
    }

    return this._provider.send('debug_traceTransaction', [txHash, { tracer, timeout }]);
  }

  async getCallTrace (block: string, txData: any, tracer: string | undefined): Promise<any> {
    return this._provider.send('debug_traceCall', [txData, block, { tracer }]);
  }
}
