import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-waffle';

const config: HardhatUserConfig = {
  defaultNetwork: 'localhost',
  solidity: {
    compilers: [
      {
        version: '0.7.6'
      },
      {
        version: '0.5.0'
      }
    ]
  },
  paths: {
    sources: './test/contracts'
  }
};

export default config;
