import { task, types } from "hardhat/config";
import {
  abi as POOL_ABI,
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'
import { ContractTransaction } from "ethers";
import '@nomiclabs/hardhat-ethers';

task("initialize-pool", "Initializes a pool")
  .addParam('pool', 'Address of pool contract', undefined, types.string)
  .addParam('sqrtPrice', 'Initial sqrtPriceX96', undefined, types.int)
  .setAction(async (args, hre) => {
    const { pool: poolAddress, sqrtPrice } = args
    const [signer] = await hre.ethers.getSigners();
    const pool = new hre.ethers.Contract(poolAddress, POOL_ABI, signer);
    const transaction: ContractTransaction = await pool.initialize(sqrtPrice);
    const receipt = await transaction.wait();

    if (receipt.events) {
      const poolInitializeEvent = receipt.events.find(el => el.event === 'Initialize');

      if (poolInitializeEvent && poolInitializeEvent.args) {
        const { sqrtPriceX96, tick } = poolInitializeEvent.args;
        console.log('Pool initialized:', sqrtPriceX96.toString(), tick);
      }
    }
  });
