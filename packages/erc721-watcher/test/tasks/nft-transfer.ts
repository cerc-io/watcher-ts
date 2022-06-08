//
// Copyright 2022 Vulcanize, Inc.
//

import { task, types } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import { ContractTransaction } from 'ethers';

task('nft-transfer', 'Move tokens to recipient')
  .addParam('nft', 'Contract address', undefined, types.string)
  .addParam('from', 'Transfer from address', undefined, types.string)
  .addParam('to', 'Transfer recipient address', undefined, types.string)
  .addParam('tokenId', 'Token ID to transfer', undefined, types.string)
  .setAction(async (args, hre) => {
    const { nft: contractAddress, from, to, tokenId } = args;
    await hre.run('compile');
    const NFT = await hre.ethers.getContractFactory('TestNFT');
    const nft = NFT.attach(contractAddress);

    const transaction: ContractTransaction = await nft['safeTransferFrom(address,address,uint256)'](from, to, tokenId);

    const receipt = await transaction.wait();

    if (receipt.events) {
      const TransferEvent = receipt.events.find(el => el.event === 'Transfer');

      if (TransferEvent && TransferEvent.args) {
        console.log('Transfer Event');
        console.log('from:', TransferEvent.args.from.toString());
        console.log('to:', TransferEvent.args.to.toString());
        console.log('tokenId:', TransferEvent.args.tokenId.toString());
      }
    }
  });
