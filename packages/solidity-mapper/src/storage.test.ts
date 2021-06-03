import { Contract } from '@ethersproject/contracts';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import '@nomiclabs/hardhat-ethers';

import { getStorageInfo, getStorageValue, StorageLayout } from './storage';
import { getStorageLayout, getStorageAt } from '../test/utils';

const TEST_DATA = [
  {
    name: 'TestBooleans',
    variable: 'bool1',
    output: {
      label: 'bool1',
      offset: 0,
      slot: '0x00',
      type: 't_bool'
    }
  },
  {
    name: 'TestIntegers',
    variable: 'int2',
    output: {
      slot: '0x00',
      offset: 1,
      type: 't_int16',
      label: 'int2'
    }
  },
  {
    name: 'TestUnsignedIntegers',
    variable: 'uint3',
    output: {
      label: 'uint3',
      offset: 0,
      slot: '0x01',
      type: 't_uint256'
    }
  },
  {
    name: 'TestAddress',
    variable: 'address1',
    output: {
      label: 'address1',
      offset: 0,
      slot: '0x00',
      type: 't_address'
    }
  },
  {
    name: 'TestStrings',
    variable: 'string2',
    output: {
      label: 'string2',
      offset: 0,
      slot: '0x01',
      type: 't_string_storage'
    }
  }
];

it('get storage information', async () => {
  const testPromises = TEST_DATA.map(async ({ name, variable, output }) => {
    const Contract = await ethers.getContractFactory(name);
    const contract = await Contract.deploy();
    await contract.deployed();
    const storageLayout = await getStorageLayout(name);

    const storageInfo = getStorageInfo(storageLayout, variable);
    expect(storageInfo).to.include(output);
  });

  await Promise.all(testPromises);
});

describe('Get value from storage', () => {
  const getBlockHash = async () => {
    const blockNumber = await ethers.provider.getBlockNumber();
    const { hash } = await ethers.provider.getBlock(blockNumber);
    return hash;
  };

  it('get value for integer type variables packed together', async () => {
    const Integers = await ethers.getContractFactory('TestIntegers');
    const integers = await Integers.deploy();
    await integers.deployed();
    const storageLayout = await getStorageLayout('TestIntegers');

    let expectedValue = 12;
    await integers.setInt1(expectedValue);
    let blockHash = await getBlockHash();
    let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, integers.address, 'int1');
    expect(value).to.equal(expectedValue);

    expectedValue = 34;
    await integers.setInt2(expectedValue);
    blockHash = await getBlockHash();
    ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, integers.address, 'int2'));
    expect(value).to.equal(expectedValue);
  });

  it('get value for integer type variables using single slot', async () => {
    const Integers = await ethers.getContractFactory('TestIntegers');
    const integers = await Integers.deploy();
    await integers.deployed();
    const storageLayout = await getStorageLayout('TestIntegers');

    const expectedValue = 123;
    await integers.setInt3(expectedValue);
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, integers.address, 'int3');
    expect(value).to.equal(expectedValue);
  });

  it('get value for unsigned integer type variables packed together', async () => {
    const UnsignedIntegers = await ethers.getContractFactory('TestUnsignedIntegers');
    const unsignedIntegers = await UnsignedIntegers.deploy();
    await unsignedIntegers.deployed();
    const storageLayout = await getStorageLayout('TestUnsignedIntegers');

    let expectedValue = 12;
    await unsignedIntegers.setUint1(expectedValue);
    let blockHash = await getBlockHash();
    let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, unsignedIntegers.address, 'uint1');
    expect(value).to.equal(expectedValue);

    expectedValue = 34;
    await unsignedIntegers.setUint2(expectedValue);
    blockHash = await getBlockHash();
    ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, unsignedIntegers.address, 'uint2'));
    expect(value).to.equal(expectedValue);
  });

  it('get value for unsigned integer type variables using single slot', async () => {
    const UnsignedIntegers = await ethers.getContractFactory('TestUnsignedIntegers');
    const unsignedIntegers = await UnsignedIntegers.deploy();
    await unsignedIntegers.deployed();
    const storageLayout = await getStorageLayout('TestUnsignedIntegers');

    const expectedValue = 123;
    await unsignedIntegers.setUint3(expectedValue);
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, unsignedIntegers.address, 'uint3');
    expect(value).to.equal(expectedValue);
  });

  it('get value for boolean type', async () => {
    const Booleans = await ethers.getContractFactory('TestBooleans');
    const booleans = await Booleans.deploy();
    await booleans.deployed();
    const storageLayout = await getStorageLayout('TestBooleans');

    let expectedValue = true;
    await booleans.setBool1(expectedValue);
    let blockHash = await getBlockHash();
    let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, booleans.address, 'bool1');
    expect(value).to.equal(expectedValue);

    expectedValue = false;
    await booleans.setBool2(expectedValue);
    blockHash = await getBlockHash();
    ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, booleans.address, 'bool2'));
    expect(value).to.equal(expectedValue);
  });

  it('get value for address type', async () => {
    const Address = await ethers.getContractFactory('TestAddress');
    const address = await Address.deploy();
    await address.deployed();
    const storageLayout = await getStorageLayout('TestAddress');

    const [signer] = await ethers.getSigners();
    await address.setAddress1(signer.address);
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, address.address, 'address1');
    expect(value).to.be.a('string');
    expect(String(value).toLowerCase()).to.equal(signer.address.toLowerCase());
  });

  it('get value for contract type', async () => {
    const contracts = ['TestContractTypes', 'TestAddress'];

    const contractPromises = contracts.map(async (contractName) => {
      const Contract = await ethers.getContractFactory(contractName);
      const contract = await Contract.deploy();
      return contract.deployed();
    });

    const [testContractTypes, testAddress] = await Promise.all(contractPromises);
    const storageLayout = await getStorageLayout('TestContractTypes');

    await testContractTypes.setAddressContract1(testAddress.address);
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testContractTypes.address, 'addressContract1');
    expect(value).to.equal(testAddress.address.toLowerCase());
  });

  it('get value for fixed size byte arrays packed together', async () => {
    const TestBytes = await ethers.getContractFactory('TestBytes');
    const testBytes = await TestBytes.deploy();
    await testBytes.deployed();
    const storageLayout = await getStorageLayout('TestBytes');

    let expectedValue = ethers.utils.hexlify(ethers.utils.randomBytes(10));
    await testBytes.setBytesTen(expectedValue);
    let blockHash = await getBlockHash();
    let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testBytes.address, 'bytesTen');
    expect(value).to.equal(expectedValue);

    expectedValue = ethers.utils.hexlify(ethers.utils.randomBytes(20));
    await testBytes.setBytesTwenty(expectedValue);
    blockHash = await getBlockHash();
    ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testBytes.address, 'bytesTwenty'));
    expect(value).to.equal(expectedValue);
  });

  it('get value for fixed size byte arrays using single slot', async () => {
    const TestBytes = await ethers.getContractFactory('TestBytes');
    const testBytes = await TestBytes.deploy();
    await testBytes.deployed();
    const storageLayout = await getStorageLayout('TestBytes');

    const expectedValue = ethers.utils.hexlify(ethers.utils.randomBytes(30));
    await testBytes.setBytesThirty(expectedValue);
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testBytes.address, 'bytesThirty');
    expect(value).to.equal(expectedValue);
  });

  it('get value for enum types', async () => {
    const TestEnums = await ethers.getContractFactory('TestEnums');
    const testEnums = await TestEnums.deploy();
    await testEnums.deployed();
    const storageLayout = await getStorageLayout('TestEnums');

    const expectedValue = 1;
    await testEnums.setChoicesEnum1(expectedValue);
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testEnums.address, 'choicesEnum1');
    expect(value).to.equal(expectedValue);
  });

  describe('string type', () => {
    let strings: Contract, storageLayout: StorageLayout;

    before(async () => {
      const Strings = await ethers.getContractFactory('TestStrings');
      strings = await Strings.deploy();
      await strings.deployed();
      storageLayout = await getStorageLayout('TestStrings');
    });

    // Test for string of size less than 32 bytes which use only one slot.
    it('get value for string length less than 32 bytes', async () => {
      const expectedValue = 'Hello world.';
      await strings.setString1(expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, strings.address, 'string1');
      expect(value).to.equal(expectedValue);
    });

    // Test for string of size 32 bytes or more which use multiple slots.
    it('get value for string length more than 32 bytes', async () => {
      const expectedValue = 'This sentence is more than 32 bytes long.';
      await strings.setString2(expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, strings.address, 'string2');
      expect(value).to.equal(expectedValue);
    });
  });

  // Test for array variables which are 32 bytes or less and packed into a single slot.
  it('get value for fixed size arrays using single slot', async () => {
    const TestFixedArrays = await ethers.getContractFactory('TestFixedArrays');
    const testFixedArrays = await TestFixedArrays.deploy();
    await testFixedArrays.deployed();
    const storageLayout = await getStorageLayout('TestFixedArrays');

    let expectedValue: Array<number|boolean> = [true, false];

    await testFixedArrays.setBoolArray(expectedValue);
    let blockHash = await getBlockHash();
    let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'boolArray');
    expect(value).to.eql(expectedValue);

    expectedValue = [1, 2, 3, 4, 5];
    await testFixedArrays.setUint16Array(expectedValue);
    blockHash = await getBlockHash();
    ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'uint16Array'));
    expect(value).to.eql(expectedValue);
  });

  // Test for array variables which are more than 32 bytes and use multiple slots.
  it('get value for fixed size arrays using multiple slots', async () => {
    const TestFixedArrays = await ethers.getContractFactory('TestFixedArrays');
    const testFixedArrays = await TestFixedArrays.deploy();
    await testFixedArrays.deployed();
    const storageLayout = await getStorageLayout('TestFixedArrays');

    const expectedValue = [1, 2, 3, 4, 5];

    await testFixedArrays.setInt128Array(expectedValue);
    let blockHash = await getBlockHash();
    let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'int128Array');
    expect(value).to.eql(expectedValue);

    await testFixedArrays.setUintArray(expectedValue);
    blockHash = await getBlockHash();
    ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'uintArray'));
    expect(value).to.eql(expectedValue);
  });
});
