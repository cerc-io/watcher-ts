//
// Copyright 2021 Vulcanize, Inc.
//

import { task, types } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import { ContractTransaction } from 'ethers';

task('token-transfer-from', 'Send tokens as spender')
  .addParam('token', 'Token contract address', undefined, types.string)
  .addParam('spenderKey', 'Spender private key', undefined, types.string)
  .addParam('to', 'Transfer recipient address', undefined, types.string)
  .addParam('amount', 'Token amount to transfer', undefined, types.int)
  .setAction(async (args, hre) => {
    const { token: tokenAddress, to, amount, spenderKey } = args;
    await hre.run('compile');
    const [owner] = await hre.ethers.getSigners();
    const wallet = new hre.ethers.Wallet(spenderKey, hre.ethers.provider);
    const Token = await hre.ethers.getContractFactory('GLDToken');
    let token = Token.attach(tokenAddress);

    token = token.connect(wallet);
    const transaction: ContractTransaction = await token.transferFrom(owner.address, to, amount);

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
