import { HardhatUserConfig } from 'hardhat/config';

import './tasks/lighthouse-deploy';
import './tasks/lighthouse-store';

const config: HardhatUserConfig = {
  defaultNetwork: 'localhost',
  solidity: '0.7.3',
  paths: {
    sources: './test/contracts'
  }
};

export default config;
