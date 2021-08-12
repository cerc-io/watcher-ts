//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs';
import yargs from 'yargs';

import { TracingClient } from '../tracing';

(async () => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    providerUrl: {
      type: 'string',
      require: true,
      demandOption: true,
      default: 'http://localhost:8545',
      describe: 'ETH JSON-RPC provider URL'
    },
    txHash: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Transaction hash'
    },
    tracer: {
      type: 'string',
      describe: 'The tracer to use'
    },
    tracerFile: {
      type: 'string',
      describe: 'File with custom tracing JS code'
    },
    timeout: {
      type: 'string',
      default: '10s',
      describe: 'Trace execution timeout'
    }
  }).argv;

  let tracer = argv.tracer;

  const tracerFile = argv.tracerFile;
  if (tracerFile) {
    tracer = fs.readFileSync(tracerFile).toString('utf-8');
  }

  const tracingClient = new TracingClient(argv.providerUrl);
  const result = await tracingClient.getTxTrace(argv.txHash, tracer, argv.timeout);

  console.log(JSON.stringify(result, null, 2));
})();
