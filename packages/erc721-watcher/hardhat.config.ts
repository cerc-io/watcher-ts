//
// Copyright 2022 Vulcanize, Inc.
//

import '@nomiclabs/hardhat-waffle';

import './test/tasks/nft-deploy';
import './test/tasks/nft-mint';
import './test/tasks/nft-transfer';
import './test/tasks/block-latest';

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  solidity: '0.8.0',
  networks: {
    docker: {
      url: 'http://geth:8545'
    }
  },
  paths: {
    sources: './test/contracts'
  }
};
