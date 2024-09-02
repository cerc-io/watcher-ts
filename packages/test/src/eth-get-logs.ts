//
// Copyright 2024 Vulcanize, Inc.
//

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

const blockHashToNumberCache: any = {};

// Format time in milliseconds into minutes and seconds
function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes}m${seconds}s${milliseconds}ms`;
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

async function getLogs(provider: providers.JsonRpcProvider, logParams: LogParams[], outputFilePath: string, curlRequestsOutputFilePath?: string) {
  for (const params of logParams) {
    const { filter, result, blockNumber } = await buildFilter(provider, params);
    const latestBlockNumber = await provider.getBlockNumber();
    result.blocksBehindHead = latestBlockNumber - blockNumber

    // Generate the curl command and write it to a file
    if (curlRequestsOutputFilePath) {
      const curlCommand = await generateCurlCommand('http://localhost:1234/rpc/v1', params);
      fs.appendFileSync(curlRequestsOutputFilePath, curlCommand + '\n\n');
    }

    try {
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
      exportResult(outputFilePath, [result]);
    }
  }
}

async function getLogsParallel(provider: providers.JsonRpcProvider, logParams: LogParams[], outputFilePath: string, curlRequestsOutputFilePath?: string) {
  const filters: any[] = [];
  const results: any[] = [];

  const latestBlockNumber = await provider.getBlockNumber();

  for (const params of logParams) {
    const { filter, result, blockNumber } = await buildFilter(provider, params);
    result.blocksBehindHead = latestBlockNumber - blockNumber

    filters.push(filter);
    results.push(result);

    // Generate the curl command and write it to a file
    if (curlRequestsOutputFilePath) {
      const curlCommand = await generateCurlCommand('http://localhost:1234/rpc/v1', params);
      fs.appendFileSync(curlRequestsOutputFilePath, curlCommand + '\n\n');
    }
  }

  try {
    // Record the start time
    const startTime = Date.now();

    await Promise.all(filters.map(async (filter, index) => {
      // Fetch logs using the filter
      const ethLogs = await provider.send(
        'eth_getLogs',
        [filter]
      );

      // Format raw eth_getLogs response
      const logs: providers.Log[] = providers.Formatter.arrayOf(
        provider.formatter.filterLog.bind(provider.formatter)
      )(ethLogs);

      // Store the result
      results[index].numEvents = logs.length;
    }));

    // Record the end time and calculate the time taken
    const endTime = Date.now();
    const timeTakenMs = endTime - startTime;
    const formattedTime = formatTime(timeTakenMs);
    results.forEach(result => result.timeTaken = formattedTime);
  } catch (error) {
    console.error(`Error fetching logs:`, error);
  } finally {
    exportResult(outputFilePath, results);
  }
}

async function buildFilter (provider: providers.JsonRpcProvider, params: LogParams): Promise<{ filter: any, result: any, blockNumber: number }> {
  // Build the filter object
  const filter: any = {
    address: params.address.map(address => address.toLowerCase()),
    topics: params.topics,
  };

  const result = {
    ...filter,
    address: params.address
  };

  let blockNumber: number;
  if (params.blockHash) {
    filter.blockHash = params.blockHash;
    result.blockHash = params.blockHash;

    if (blockHashToNumberCache[params.blockHash]) {
      blockNumber = blockHashToNumberCache[params.blockHash];
    } else {
      const block = await provider.getBlock(params.blockHash);
      blockNumber = block.number;
      blockHashToNumberCache[params.blockHash] = blockNumber;
    }

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

  return { filter, result, blockNumber };
}

function exportResult (outputFilePath: string, results: any[]): void {
  let existingData = [];

  // Read existing outputfile
  if (fs.existsSync(outputFilePath)) {
    const data = fs.readFileSync(outputFilePath, 'utf-8');
    existingData = JSON.parse(data || '[]');
  }

  // Append new result to existing data
  existingData.push(...results);

  // Write the updated data back to the JSON file
  fs.writeFileSync(outputFilePath, JSON.stringify(existingData, null, 2));
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
      describe: 'Output file path for curl requests',
      type: 'string'
    },
    parallel: {
      alias: 'p',
      default: false,
      describe: 'Make requests in parallel',
      type: 'boolean'
    },
  }).argv;

  const outputFilePath = path.resolve(argv.output);
  const curlRequestsOutputFilePath: string | undefined = argv.curlRequestsOutput ? path.resolve(argv.curlRequestsOutput) : undefined;

  // Read the input json file
  const logParams: LogParams[] = JSON.parse(fs.readFileSync(path.resolve(argv.input), 'utf-8'));

  // Create a provider with sufficient timeout
  const timeout = 10 * 60 * 1000; // 10mins
  const provider = new providers.JsonRpcProvider({ url: argv.endpoint, timeout });

  // Get logs and measure performance
  if (argv.parallel) {
    log('Making parallel requests');
    await getLogsParallel(provider, logParams, outputFilePath, curlRequestsOutputFilePath);
  } else {
    log('Making serial requests');
    await getLogs(provider, logParams, outputFilePath, curlRequestsOutputFilePath);
  }

  log(`Results written to ${outputFilePath}`);
  log(`CURL requests written to ${curlRequestsOutputFilePath}`);
}

main().catch(err => {
  log(err);
});
