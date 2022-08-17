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
  localEndpointURL: string,
  remoteEndpointURL: string,
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

  const localResult = await performEthCall(config.localEndpointURL, config.contractAddress, contractAbi, config.blockTag);
  const remoteResult = await performEthCall(config.remoteEndpointURL, config.contractAddress, contractAbi, config.blockTag);

  if(_.isEqual(localResult, remoteResult)) {
    console.log("Results from local and remote endpoints match");
  } else {
    console.log("Results from local and remote endpoints do not match");
    console.log("local:", localResult);
    console.log("remote:", remoteResult);
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

  const {local: localEndpointURL, remote: remoteEndpointURL} = endpointConfig;
  assert(localEndpointURL, 'Missing local endpoing URL');
  assert(remoteEndpointURL, 'Missing remote endpoing URL');

  const {address: contractAddress, abi: abiPath} = contractConfig;
  assert(contractAddress, 'Missing contract address');
  assert(abiPath, 'Missing contract ABI path');

  assert(blockTag)

  return {
    localEndpointURL,
    remoteEndpointURL,
    contractAddress,
    abiPath,
    blockTag
  };
}

main().catch(err => {
  console.log(err);
});
