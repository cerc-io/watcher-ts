//
// Copyright 2022 Vulcanize, Inc.
//

import { task } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';

task('nft-deploy', 'Deploys NFT')
  .setAction(async (args, hre) => {
    await hre.run('compile');
    const NFT = await hre.ethers.getContractFactory('TestNFT');
    const nft = await NFT.deploy();

    console.log('NFT deployed to:', nft.address);
  });
