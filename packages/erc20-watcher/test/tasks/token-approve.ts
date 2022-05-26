//
// Copyright 2021 Vulcanize, Inc.
//

import { task, types } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import { ContractTransaction, BigNumber } from 'ethers';

const DEFAULT_APPROVE_AMOUNT = '1000000000000000000000000';

task('token-approve', 'Move tokens to recipient')
  .addParam('token', 'Token contract address', undefined, types.string)
  .addParam('spender', 'Spender address', undefined, types.string)
  .addParam('amount', 'Token amount to transfer', DEFAULT_APPROVE_AMOUNT, types.string)
  .setAction(async (args, hre) => {
    const { token: tokenAddress, amount, spender } = args;
    await hre.run('compile');
    const Token = await hre.ethers.getContractFactory('GLDToken');
    const token = Token.attach(tokenAddress);

    const transaction: ContractTransaction = await token.approve(spender, BigNumber.from(amount));
    const receipt = await transaction.wait();

    if (receipt.events) {
      const TransferEvent = receipt.events.find(el => el.event === 'Approval');

      if (TransferEvent && TransferEvent.args) {
        console.log('Approval Event at block:', receipt.blockNumber, receipt.blockHash);
        console.log('owner:', TransferEvent.args.owner.toString());
        console.log('spender:', TransferEvent.args.spender.toString());
        console.log('value:', TransferEvent.args.value.toString());
      }
    }
  });
