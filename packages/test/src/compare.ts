//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import fs from 'fs-extra';
import path from 'path';
import assert from 'assert';
import toml from 'toml';
import _ from "lodash";

import { readAbi, performEthCall } from './common'

interface Config {
  endpoint1URL: string,
  endpoint2URL: string,
  contractAddress: string,
  abiPath: string,
  blockTag: string
}

const main = async (): Promise<void> => {
  const argv = await yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'c',
      type: 'string',
      demandOption: true,
      describe: 'Configuration file path (toml)',
    }
  }).argv;

  const config = await getConfig(argv.configFile);

  // Load contract ABI.
  const contractAbi = readAbi(config.abiPath)

  const endpoint1Result = await performEthCall(config.endpoint1URL, config.contractAddress, contractAbi, config.blockTag);
  const endpoint2Result = await performEthCall(config.endpoint2URL, config.contractAddress, contractAbi, config.blockTag);

  if(_.isEqual(endpoint1Result, endpoint2Result)) {
    console.log("Results from endpoint1 and endpoint2 match");
  } else {
    console.log("Results from endpoint1 and endpoint2 do not match");
    console.log("endpoint1:", endpoint1Result);
    console.log("endpoint2:", endpoint2Result);
  }
}

const getConfig = async (configFile: string): Promise<Config> => {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const x = await fs.readFile(configFilePath, 'utf8')
  const config = toml.parse(x);
  
  const { endpoints: endpointConfig, contract: contractConfig, blockTag } = config;
  assert(endpointConfig, 'Missing endpoints config');
  assert(contractConfig, 'Missing contract config');

  const {endpoint1: endpoint1URL, endpoint2: endpoint2URL} = endpointConfig;
  assert(endpoint1URL, 'Missing endpoint1 URL');
  assert(endpoint2URL, 'Missing endpoint2 URL');

  const {address: contractAddress, abi: abiPath} = contractConfig;
  assert(contractAddress, 'Missing contract address');
  assert(abiPath, 'Missing contract ABI path');

  assert(blockTag)

  return {
    endpoint1URL,
    endpoint2URL,
    contractAddress,
    abiPath,
    blockTag
  };
}

main().catch(err => {
  console.log(err);
});
