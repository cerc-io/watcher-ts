//
// Copyright 2022 Vulcanize, Inc.
//

import { task, types } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import { ContractTransaction } from 'ethers';

task('example-test', 'Trigger Test event')
  .addParam('address', 'Contract address', undefined, types.string)
  .setAction(async (args, hre) => {
    const { address } = args;
    await hre.run('compile');
    const Example = await hre.ethers.getContractFactory('Example');
    const example = Example.attach(address);

    const transaction: ContractTransaction = await example.emitEvent();

    const receipt = await transaction.wait();

    if (receipt.events) {
      const TestEvent = receipt.events.find(el => el.event === 'Test');

      if (TestEvent && TestEvent.args) {
        console.log('Test Event');
        console.log('param1:', TestEvent.args.param1.toString());
        console.log('param2:', TestEvent.args.param2.toString());
        console.log('param3:', TestEvent.args.param3.toString());
      }
    }
  });
