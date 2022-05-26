//
// Copyright 2021 Vulcanize, Inc.
//

import { task, types } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import { ContractTransaction } from 'ethers';

task('token-transfer', 'Move tokens to recipient')
  .addParam('token', 'Token contract address', undefined, types.string)
  .addParam('to', 'Transfer recipient address', undefined, types.string)
  .addParam('amount', 'Token amount to transfer', undefined, types.int)
  .setAction(async (args, hre) => {
    const { token: tokenAddress, to, amount } = args;
    await hre.run('compile');
    const Token = await hre.ethers.getContractFactory('GLDToken');
    const token = Token.attach(tokenAddress);

    const transaction: ContractTransaction = await token.transfer(to, amount);

    const receipt = await transaction.wait();

    if (receipt.events) {
      const TransferEvent = receipt.events.find(el => el.event === 'Transfer');

      if (TransferEvent && TransferEvent.args) {
        console.log('Transfer Event at block:', receipt.blockNumber, receipt.blockHash);
        console.log('from:', TransferEvent.args.from.toString());
        console.log('to:', TransferEvent.args.to.toString());
        console.log('value:', TransferEvent.args.value.toString());
      }
    }
  });
