import { task, types } from "hardhat/config";
import '@nomiclabs/hardhat-ethers';

task("deploy-token", "Deploys new token")
  .addParam('name', 'Name of the token', undefined, types.string)
  .addParam('symbol', 'Symbol of the token', undefined, types.string)
  .setAction(async (args, hre) => {
    const { name, symbol } = args
    await hre.run("compile");
    const Token = await hre.ethers.getContractFactory('ERC20Token');
    const token = await Token.deploy(name, symbol);

    console.log(`Token ${symbol} deployed to:`, token.address)
    return token;
  });
