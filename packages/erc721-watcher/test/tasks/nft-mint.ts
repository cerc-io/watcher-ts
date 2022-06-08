//
// Copyright 2022 Vulcanize, Inc.
//

import { task, types } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import { ContractTransaction } from 'ethers';

task('nft-mint', 'Mint NFT')
  .addParam('nft', 'Contract address', undefined, types.string)
  .addParam('tokenId', 'Token ID', undefined, types.string)
  .addParam('to', 'Transfer recipient address', undefined, types.string)
  .setAction(async (args, hre) => {
    const { tokenId, to, nft: contractAddress } = args;
    await hre.run('compile');
    const NFT = await hre.ethers.getContractFactory('TestNFT');
    const nft = NFT.attach(contractAddress);

    const transaction: ContractTransaction = await nft.mint(to, tokenId);

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
