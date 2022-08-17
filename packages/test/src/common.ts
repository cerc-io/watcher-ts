//
// Copyright 2022 Vulcanize, Inc.
//

import fs from 'fs-extra';
import path from 'path';
import { ethers, providers } from 'ethers';

export const performEthCall = async (endpointURL: string, contractAddress: string, abi: ethers.ContractInterface, blockTag: string | undefined): Promise<any> => {
  const provider = new providers.JsonRpcProvider(endpointURL);
  const contract = new ethers.Contract(contractAddress, abi, provider);

  return contract.feeToSetter({blockTag});
}

export const readAbi = (abiPath: string): any => {
  const fullAbiPath = path.resolve(abiPath);

  return JSON.parse(fs.readFileSync(fullAbiPath).toString());
}
