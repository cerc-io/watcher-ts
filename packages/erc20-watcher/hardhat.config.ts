//
// Copyright 2021 Vulcanize, Inc.
//

import '@nomiclabs/hardhat-waffle';

import './test/tasks/token-deploy';
import './test/tasks/token-transfer';
import './test/tasks/token-approve';
import './test/tasks/token-transfer-from';
import './test/tasks/block-latest';
import './test/tasks/account';

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  solidity: '0.8.0',
  networks: {
    docker: {
      url: process.env.ETH_RPC_URL
    }
  },
  paths: {
    sources: './test/contracts'
  }
};
