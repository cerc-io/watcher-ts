import { task, types } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import { ContractTransaction, utils } from 'ethers';

task('lighthouse-store', 'Call Lighthouse store method')
  .addParam('lighthouse', 'Address of Lighthouse contract', undefined, types.string)
  .addParam('cid', 'store cid', undefined, types.string)
  .addParam('storeConfig', 'store config', undefined, types.string)
  .addParam('fileCost', 'store fileCost (wei)', undefined, types.float)
  .setAction(async (args, hre) => {
    const {
      lighthouse: lighthouseAddress,
      cid,
      storeConfig: config,
      fileCost
    } = args;

    await hre.run('compile');

    const Ligthouse = await hre.ethers.getContractFactory('Lighthouse');
    const lighthouse = Ligthouse.attach(lighthouseAddress);
    const value = utils.parseUnits(String(fileCost), 'wei');

    const transaction: ContractTransaction = await lighthouse.store(cid, config, { value });

    const receipt = await transaction.wait();

    if (receipt.events) {
      console.log('receipt blockHash', receipt.blockHash);

      const storageRequestEvent = receipt.events.find(el => el.event === 'StorageRequest');

      if (storageRequestEvent && storageRequestEvent.args) {
        console.log('StorageRequest Event');
        console.log('uploader:', storageRequestEvent.args.uploader);
        console.log('cid:', storageRequestEvent.args.cid);
        console.log('config:', storageRequestEvent.args.config);
        console.log('fileCost:', storageRequestEvent.args.fileCost.toString());
      }
    }
  });
