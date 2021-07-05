import { task, types } from "hardhat/config";
import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE,
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'

task("deploy-factory", "Deploys Factory contract")
  .setAction(async (_, hre) => {
    const [signer] = await hre.ethers.getSigners();
    const Factory = new hre.ethers.ContractFactory(FACTORY_ABI , FACTORY_BYTECODE, signer);
    const factory = await Factory.deploy();
    await factory.deployed();
    console.log("Factory deployed to:", factory.address);
  });
