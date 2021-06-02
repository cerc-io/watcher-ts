import { expect } from 'chai';
import { artifacts, ethers } from 'hardhat';

import { getEventNameTopics } from './logs';

const TEST_DATA = [
  {
    name: 'TestIntegers',
    output: {}
  },
  {
    name: 'TestEvents',
    output: {
      // Signature of event is a keccak256 hash of event name and input argument types.
      // keccak256('Event1(string,string)')
      Event1: '0xead5fc99a8133dbf3f4e87d1ada4e5a4cf65170fad6445d34042e643f6a30b79'
    }
  }
];

it('get event name topics', async function () {
  const testPromises = TEST_DATA.map(async ({ name, output }) => {
    const Contract = await ethers.getContractFactory(name);
    const contract = await Contract.deploy();
    await contract.deployed();
    const { abi } = await artifacts.readArtifact(name);

    const eventNameTopics = getEventNameTopics(abi);
    expect(eventNameTopics).to.eql(output);
  });

  await Promise.all(testPromises);
});
