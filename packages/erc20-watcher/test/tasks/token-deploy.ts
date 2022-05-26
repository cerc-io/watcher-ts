//
// Copyright 2021 Vulcanize, Inc.
//

import { task, types } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';

const DEFAULT_INITIAL_SUPPLY = '1000000000000000000000';

task('token-deploy', 'Deploys GLD token')
  .addOptionalParam('initialSupply', 'Set total supply', DEFAULT_INITIAL_SUPPLY, types.string)
  .setAction(async (args, hre) => {
    const { initialSupply } = args;
    await hre.run('compile');
    const Token = await hre.ethers.getContractFactory('GLDToken');
    const token = await Token.deploy(hre.ethers.BigNumber.from(initialSupply));

    const receipt = await token.deployTransaction.wait();
    console.log('GLD Token deployed to:', token.address);
    console.log('Deployed at block:', receipt.blockNumber, receipt.blockHash);
  });
