//
// Copyright 2022 Vulcanize, Inc.
//

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs-extra';
import path from 'path';
import assert from 'assert';
import toml from 'toml';
import _ from "lodash";
import { ethers, providers } from 'ethers';

interface Config {
  localEndpointURL: string,
  remoteEndpointURL: string,
  contractAddress: string,
  abiPath: string,
  blockTag: string
}

const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .option('config-file', {
      alias: 'c',
      demandOption: true,
      describe: 'Config',
      type: 'string'
    })
    .argv;

  const config = await getConfig(path.resolve(argv['config-file']));

  // Load contract ABI.
  const contractAbi = JSON.parse(fs.readFileSync(config.abiPath).toString());

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

const performEthCall = async (endpointURL: string, contractAddress: string, abi: ethers.ContractInterface, blockTag: string): Promise<any> => {
  const provider = new providers.JsonRpcProvider(endpointURL);
  const contract = new ethers.Contract(contractAddress, abi, provider);

  const result = contract.feeToSetter({blockTag});

  return result
}

const getConfig = async (configFile: string): Promise<Config> => {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const x = await fs.readFile(configFilePath, 'utf8')
  const config = toml.parse(x);
  // console.log("config", config);
  
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
