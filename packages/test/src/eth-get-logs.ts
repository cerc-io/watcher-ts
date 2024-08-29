import { providers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import debug from 'debug';
import yargs from 'yargs';
import assert from 'assert';

const log = debug('vulcanize:test');

interface LogParams {
  address: string[];
  topics: string[][];
  fromBlock?: string;
  toBlock?: string;
  blockHash?: string;
}

// Format time in milliseconds into minutes and seconds
function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m${seconds}s`;
}

async function generateCurlCommand(rpcEndpoint: string, params: LogParams): Promise<string> {
  const curlParams: any = {
    address: params.address,
    topics: params.topics
  };

  if (params.blockHash) {
    curlParams.blockHash = params.blockHash;
  } else {
    curlParams.fromBlock = params.fromBlock;
    curlParams.toBlock = params.toBlock;
  }

  const requestBody = {
    jsonrpc: "2.0",
    method: "eth_getLogs",
    params: [curlParams],
    id: 1
  };

  const curlCommand = `time curl -X POST -H "Content-Type: application/json" \\\n-d '${JSON.stringify(requestBody, null, 2)}' \\\n${rpcEndpoint}`;
  return curlCommand;
}

async function getLogs(provider: providers.JsonRpcProvider, logParams: LogParams[], outputFilePath: string, curlRequestsOutputFilePath: string) {
  for (const params of logParams) {
    // Result object
    let result: any = {};

    try {
      // Build the filter object
      const filter: any = {
        address: params.address.map(address => address.toLowerCase()),
        topics: params.topics,
      };

      result = {
        ...filter,
        address: params.address
      };

      let blockNumber: number;
      if (params.blockHash) {
        filter.blockHash = params.blockHash;
        result.blockHash = params.blockHash;

        const block = await provider.getBlock(params.blockHash);
        blockNumber = block.number;
        result.blockNumber = blockNumber;
      } else {
        assert(params.toBlock && params.fromBlock, 'fromBlock or toBlock not found');

        filter.fromBlock = params.fromBlock;
        filter.toBlock = params.toBlock;

        result.fromBlock = params.fromBlock;
        result.toBlock = params.toBlock;

        blockNumber = parseInt(params.toBlock, 16);
        result.blocksRange = parseInt(params.toBlock, 16) - parseInt(params.fromBlock, 16);
      }

      const latestBlockNumber = await provider.getBlockNumber();
      result.blocksBehindHead = latestBlockNumber - blockNumber

      // Record the start time
      const startTime = Date.now();

      // Fetch logs using the filter
      const ethLogs = await provider.send(
        'eth_getLogs',
        [filter]
      );

      // Format raw eth_getLogs response
      const logs: providers.Log[] = providers.Formatter.arrayOf(
        provider.formatter.filterLog.bind(provider.formatter)
      )(ethLogs);

      // Record the end time and calculate the time taken
      const endTime = Date.now();
      const timeTakenMs = endTime - startTime;

      // Store the result
      result.numEvents = logs.length;
      result.timeTaken = formatTime(timeTakenMs);
    } catch (error) {
      console.error(`Error fetching logs for params ${JSON.stringify(params)}:`, error);
    } finally {
      let existingData = [];

      // Read existing outputfile
      if (fs.existsSync(outputFilePath)) {
        const data = fs.readFileSync(outputFilePath, 'utf-8');
        existingData = JSON.parse(data || '[]');
      }

      // Append new result to existing data
      existingData.push(result);

      // Write the updated data back to the JSON file
      fs.writeFileSync(outputFilePath, JSON.stringify(existingData, null, 2));

      // Generate the curl command and write it to a file
      const curlCommand = await generateCurlCommand('http://localhost:1234/rpc/v1', params);
      fs.appendFileSync(curlRequestsOutputFilePath, curlCommand + '\n\n');
    }
  }
}

async function main() {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    endpoint: {
      alias: 'e',
      demandOption: true,
      describe: 'Endpoint to perform eth-get-logs calls against',
      type: 'string'
    },
    input: {
      alias: 'i',
      demandOption: true,
      describe: 'Input file path',
      type: 'string'
    },
    output: {
      alias: 'o',
      demandOption: true,
      describe: 'Output file path',
      type: 'string'
    },
    curlRequestsOutput: {
      alias: 'c',
      demandOption: true,
      describe: 'Output file path for curl requests',
      type: 'string'
    },
  }).argv;

  const outputFilePath = path.resolve(argv.output);
  const curlRequestsOutputFilePath = path.resolve(argv.curlRequestsOutput);

  // Read the input json file
  const logParams: LogParams[] = JSON.parse(fs.readFileSync(path.resolve(argv.input), 'utf-8'));

  // Create a provider with sufficient timeout
  const timeout = 10 * 60 * 1000; // 10mins
  const provider = new providers.JsonRpcProvider({ url: argv.endpoint, timeout });

  // Get logs and measure performance
  await getLogs(provider, logParams, outputFilePath, curlRequestsOutputFilePath);

  log(`Results written to ${outputFilePath}`);
  log(`CURL requests written to ${curlRequestsOutputFilePath}`);
}

main().catch(err => {
  log(err);
});
