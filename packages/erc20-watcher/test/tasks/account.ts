//
// Copyright 2022 Vulcanize, Inc.
//

import { task } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';

task('account', 'Prints the account', async (taskArgs, hre) => {
  const [account] = await hre.ethers.getSigners();

  console.log(account.address);
});
