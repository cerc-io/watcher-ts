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
    block: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'Block hash or number'
    },
    txFile: {
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'File with tx data for call tracing'
    },
    tracer: {
      type: 'string',
      describe: 'The tracer to use'
    },
    tracerFile: {
      type: 'string',
      describe: 'File with custom tracing JS code'
    }
  }).argv;

  let tracer = argv.tracer;

  const tracerFile = argv.tracerFile;
  if (tracerFile) {
    tracer = fs.readFileSync(tracerFile).toString('utf-8');
  }

  const txData = JSON.parse(fs.readFileSync(argv.txFile).toString('utf-8'));

  const tracingClient = new TracingClient(argv.providerUrl);
  const result = await tracingClient.getCallTrace(argv.block, txData, tracer);

  console.log(JSON.stringify(result, null, 2));
})();
