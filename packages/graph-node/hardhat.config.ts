//
// Copyright 2022 Vulcanize, Inc.
//

import '@nomiclabs/hardhat-waffle';

import './test/tasks/example-deploy';

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  solidity: '0.8.0',
  paths: {
    sources: './test/contracts'
  }
};
