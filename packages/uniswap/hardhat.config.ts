import 'dotenv/config';
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";

import './tasks/accounts';
import './tasks/deploy-factory';
import './tasks/deploy-token';
import './tasks/create-pool';
import './tasks/initialize-pool';
import './tasks/mint-pool';

const config: HardhatUserConfig = {
  solidity: "0.8.0",
  networks: {
    private: {
      url: process.env.ETH_RPC_URL
    }
  },
  defaultNetwork: 'private'
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
export default config;
