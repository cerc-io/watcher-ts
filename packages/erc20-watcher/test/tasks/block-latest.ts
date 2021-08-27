//
// Copyright 2021 Vulcanize, Inc.
//

import { task } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';

task(
  'block-latest',
  'Prints the current block info',
  async (_, { ethers }) => {
    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);

    console.log('Block Number:', blockNumber);
    console.log('Block Hash:', block.hash);
  }
);
