//
// Copyright 2022 Vulcanize, Inc.
//

import { task } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';

task('example-deploy', 'Deploys Example contract')
  .setAction(async (args, hre) => {
    await hre.run('compile');
    const Example = await hre.ethers.getContractFactory('Example');
    const example = await Example.deploy();

    console.log('Example contract deployed to:', example.address);
  });
