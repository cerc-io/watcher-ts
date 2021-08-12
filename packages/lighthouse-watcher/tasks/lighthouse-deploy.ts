//
// Copyright 2021 Vulcanize, Inc.
//

import { task } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';

task('lighthouse-deploy', 'Deploys Lighthouse contract')
  .setAction(async (_, hre) => {
    await hre.run('compile');

    const lighthouseFactory = await hre.ethers.getContractFactory('Lighthouse');
    const lighthouse = await lighthouseFactory.deploy();

    console.log('Lighthouse deployed to:', lighthouse.address);
  });
