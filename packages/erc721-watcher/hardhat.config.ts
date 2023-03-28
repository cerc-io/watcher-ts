//
// Copyright 2022 Vulcanize, Inc.
//

import '@nomiclabs/hardhat-waffle';

import './test/tasks/nft-deploy';
import './test/tasks/nft-mint';
import './test/tasks/nft-transfer';
import './test/tasks/block-latest';
import './test/tasks/account';

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  solidity: '0.8.1',
  networks: {
    docker: {
      url: process.env.ETH_RPC_URL
    }
  },
  paths: {
    sources: './test/contracts'
  }
};
