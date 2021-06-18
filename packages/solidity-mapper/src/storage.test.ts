/* eslint-disable @typescript-eslint/no-explicit-any */
import { Contract } from '@ethersproject/contracts';
import { expect } from 'chai';
import '@nomiclabs/hardhat-ethers';
import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { getStorageInfo, getStorageValue, StorageLayout } from './storage';
import { getStorageLayout, getStorageAt as rpcGetStorageAt, generateDummyAddresses } from '../test/utils';

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

  let getStorageAt = rpcGetStorageAt;

  // Check if running test against ipld graphql endpoint.
  if (process.env.IPLD_GQL) {
    // Set ipld-eth-client.
    const ethClient = new EthClient({
      gqlEndpoint: process.env.GQL_ENDPOINT || '',
      gqlSubscriptionEndpoint: process.env.GQL_ENDPOINT || '',
      cache: undefined
    });

    // Use ipld graphql endpoint to get storage value.
    getStorageAt = ethClient.getStorageAt.bind(ethClient);
  }

  describe('signed integer type', () => {
    let integers: Contract, storageLayout: StorageLayout;

    before(async () => {
      const Integers = await ethers.getContractFactory('TestIntegers');
      integers = await Integers.deploy();
      await integers.deployed();
      storageLayout = await getStorageLayout('TestIntegers');
    });

    it('get value for integer type variables packed together', async () => {
      let expectedValue = 12;
      let transaction = await integers.setInt1(expectedValue);
      await transaction.wait();
      let blockHash = await getBlockHash();
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, integers.address, 'int1');
      expect(value).to.equal(BigInt(expectedValue));

      expectedValue = 34;
      transaction = await integers.setInt2(expectedValue);
      await transaction.wait();
      blockHash = await getBlockHash();
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, integers.address, 'int2'));
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for integer type variables using single slot', async () => {
      const expectedValue = 123;
      const transaction = await integers.setInt3(expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, integers.address, 'int3');
      expect(value).to.equal(BigInt(expectedValue));
    });
  });

  describe('unsigned integer type', () => {
    let unsignedIntegers: Contract, storageLayout: StorageLayout;

    before(async () => {
      const UnsignedIntegers = await ethers.getContractFactory('TestUnsignedIntegers');
      unsignedIntegers = await UnsignedIntegers.deploy();
      await unsignedIntegers.deployed();
      storageLayout = await getStorageLayout('TestUnsignedIntegers');
    });

    it('get value for unsigned integer type variables packed together', async () => {
      let expectedValue = 12;
      let transaction = await unsignedIntegers.setUint1(expectedValue);
      await transaction.wait();
      let blockHash = await getBlockHash();
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, unsignedIntegers.address, 'uint1');
      expect(value).to.equal(BigInt(expectedValue));

      expectedValue = 34;
      transaction = await unsignedIntegers.setUint2(expectedValue);
      await transaction.wait();
      blockHash = await getBlockHash();
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, unsignedIntegers.address, 'uint2'));
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for unsigned integer type variables using single slot', async () => {
      const expectedValue = 123;
      const transaction = await unsignedIntegers.setUint3(expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, unsignedIntegers.address, 'uint3');
      expect(value).to.equal(BigInt(expectedValue));
    });
  });

  it('get value for boolean type', async () => {
    const Booleans = await ethers.getContractFactory('TestBooleans');
    const booleans = await Booleans.deploy();
    await booleans.deployed();
    const storageLayout = await getStorageLayout('TestBooleans');

    let expectedValue = true;
    let transaction = await booleans.setBool1(expectedValue);
    await transaction.wait();
    let blockHash = await getBlockHash();
    let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, booleans.address, 'bool1');
    expect(value).to.equal(expectedValue);

    expectedValue = false;
    transaction = await booleans.setBool2(expectedValue);
    await transaction.wait();
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
    const transaction = await address.setAddress1(signer.address);
    await transaction.wait();
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

    const transaction = await testContractTypes.setAddressContract1(testAddress.address);
    await transaction.wait();
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
    let transaction = await testBytes.setBytesTen(expectedValue);
    await transaction.wait();
    let blockHash = await getBlockHash();
    let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testBytes.address, 'bytesTen');
    expect(value).to.equal(expectedValue);

    expectedValue = ethers.utils.hexlify(ethers.utils.randomBytes(20));
    transaction = await testBytes.setBytesTwenty(expectedValue);
    await transaction.wait();
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
    const transaction = await testBytes.setBytesThirty(expectedValue);
    await transaction.wait();
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
    const transaction = await testEnums.setChoicesEnum1(expectedValue);
    await transaction.wait();
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testEnums.address, 'choicesEnum1');
    expect(value).to.equal(BigInt(expectedValue));
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
      const transaction = await strings.setString1(expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, strings.address, 'string1');
      expect(value).to.equal(expectedValue);
    });

    // Test for string of size 32 bytes or more which use multiple slots.
    it('get value for string length more than 32 bytes', async () => {
      const expectedValue = 'This sentence is more than 32 bytes long.';
      const transaction = await strings.setString2(expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, strings.address, 'string2');
      expect(value).to.equal(expectedValue);
    });
  });

  describe('dynamically sized byte array', () => {
    let testBytes: Contract, storageLayout: StorageLayout;

    before(async () => {
      const TestBytes = await ethers.getContractFactory('TestBytes');
      testBytes = await TestBytes.deploy();
      await testBytes.deployed();
      storageLayout = await getStorageLayout('TestBytes');
    });

    it('get value for byte array length less than 32 bytes', async () => {
      const expectedValue = ethers.utils.hexlify(ethers.utils.randomBytes(24));
      const transaction = await testBytes.setBytesArray(expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testBytes.address, 'bytesArray');
      expect(value).to.equal(expectedValue);
    });

    it('get value for byte array length more than 32 bytes', async () => {
      const expectedValue = ethers.utils.hexlify(ethers.utils.randomBytes(100));
      const transaction = await testBytes.setBytesArray(expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testBytes.address, 'bytesArray');
      expect(value).to.equal(expectedValue);
    });
  });

  describe('fixed size arrays', () => {
    let testFixedArrays: Contract, storageLayout: StorageLayout;
    const int128Array = [100, 200, 300, 400, 500];
    const uint16Array = [10, 20, 30, 40, 50];
    const boolArray = [true, false];
    const enumArray = [1, 0, 2, 1, 3, 2];
    const stringArray = ['abcde', 'fg', 'hijklmn'];

    const bytesArray = Array.from({ length: 4 }, () => {
      const bytesLength = Math.floor(Math.random() * 64);
      return ethers.utils.hexlify(ethers.utils.randomBytes(bytesLength));
    });

    const addressArray = generateDummyAddresses(4);

    before(async () => {
      const TestFixedArrays = await ethers.getContractFactory('TestFixedArrays');
      testFixedArrays = await TestFixedArrays.deploy();
      await testFixedArrays.deployed();
      storageLayout = await getStorageLayout('TestFixedArrays');
    });

    // Get all elements of array.
    // Test for array variables which are 32 bytes or less and packed into a single slot.
    it('get value for fixed size arrays using single slot', async () => {
      const transaction1 = await testFixedArrays.setBoolArray(boolArray);
      const transaction2 = await testFixedArrays.setUint16Array(uint16Array);
      await Promise.all([transaction1.wait(), transaction2.wait()]);
      const blockHash = await getBlockHash();

      // Test for variable boolArray.
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'boolArray');
      expect(value).to.eql(boolArray);
      let proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(boolArray.length);

      // Test for variable uint16Array.
      ({ value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'uint16Array'));
      expect(value).to.eql(uint16Array.map(el => BigInt(el)));
      proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(uint16Array.length);
    });

    // Test for array variables which are more than 32 bytes and use multiple slots.
    it('get value for fixed size arrays using multiple slots', async () => {
      const transaction1 = await testFixedArrays.setInt128Array(int128Array);
      const transaction2 = await testFixedArrays.setUintArray(uint16Array);
      await Promise.all([transaction1.wait(), transaction2.wait()]);
      const blockHash = await getBlockHash();

      // Test for variable int128Array.
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'int128Array');
      expect(value).to.eql(int128Array.map(el => BigInt(el)));
      let proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(int128Array.length);

      // Test for variable uintArray.
      ({ value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'uintArray'));
      expect(value).to.eql(uint16Array.map(el => BigInt(el)));
      proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(uint16Array.length);
    });

    it('get value for fixed size arrays of address type', async () => {
      const transaction = await testFixedArrays.setAddressArray(addressArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'addressArray');
      expect(value).to.eql(addressArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(addressArray.length);
    });

    it('get value for fixed size arrays of fixed size bytes type', async () => {
      const expectedValue = Array.from({ length: 5 }, () => ethers.utils.hexlify(ethers.utils.randomBytes(10)));

      const transaction = await testFixedArrays.setFixedBytesArray(expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'fixedBytesArray');
      expect(value).to.eql(expectedValue);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(expectedValue.length);
    });

    it('get value for fixed size arrays of enum type', async () => {
      const transaction = await testFixedArrays.setEnumArray(enumArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'enumArray');
      expect(value).to.eql(enumArray.map(el => BigInt(el)));
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(enumArray.length);
    });

    it('get value for fixed size arrays of dynamic byte array type', async () => {
      const transaction = await testFixedArrays.setBytesArray(bytesArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'bytesArray');
      expect(value).to.eql(bytesArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(bytesArray.length);
    });

    it('get value for fixed size arrays of string type', async () => {
      const transaction = await testFixedArrays.setStringArray(stringArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'stringArray');
      expect(value).to.eql(stringArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(stringArray.length);
    });

    it('get value for fixed size array of struct type', async () => {
      const expectedValue = [];

      for (let i = 0; i < 5; i++) {
        const structElement = {
          int1: BigInt(i + 1),
          uint1: BigInt(i + 2),
          bool1: Boolean(i % 2)
        };

        expectedValue[i] = structElement;
      }

      const transactionPromises = expectedValue.map(async (structElement, index) => {
        const transaction = await testFixedArrays.setStructArray(structElement, index);
        return transaction.wait();
      });
      await Promise.all(transactionPromises);

      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'structArray');
      expect(value).to.eql(expectedValue);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(expectedValue.length);
    });

    // Get element of array by index.
    it('get value of signed integer type array by index', async () => {
      const arrayIndex = 2;
      const transaction = await testFixedArrays.setInt128Array(int128Array);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'int128Array', arrayIndex);
      expect(value).to.equal(BigInt(int128Array[arrayIndex]));
    });

    it('get value of unsigned integer type array by index', async () => {
      const arrayIndex = 3;
      const transaction = await testFixedArrays.setUint16Array(uint16Array);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'uint16Array', arrayIndex);
      expect(value).to.equal(BigInt(uint16Array[arrayIndex]));
    });

    it('get value of boolean type array by index', async () => {
      const arrayIndex = 0;
      const transaction = await testFixedArrays.setBoolArray(boolArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'boolArray', arrayIndex);
      expect(value).to.equal(boolArray[arrayIndex]);
    });

    it('get value of address type array by index', async () => {
      const arrayIndex = 1;
      const transaction = await testFixedArrays.setAddressArray(addressArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'addressArray', arrayIndex);
      expect(value).to.equal(addressArray[arrayIndex]);
    });

    it('get value of enum type array by index', async () => {
      const arrayIndex = 3;
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'enumArray', arrayIndex);
      expect(value).to.eql(BigInt(enumArray[arrayIndex]));
    });

    it('get value of struct type array by index', async () => {
      const expectedValue = {
        int1: BigInt(123),
        uint1: BigInt(456),
        bool1: false
      };

      const arrayIndex = 2;
      const transaction = await testFixedArrays.setStructArray(expectedValue, arrayIndex);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'structArray', arrayIndex);
      expect(value).to.eql(expectedValue);

      // Get value of specified struct member in array element.
      const structMember = 'uint1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'structArray', arrayIndex, structMember));
      expect(value).to.eql(expectedValue[structMember]);
    });

    it('get value of dynamic bytes type array by index', async () => {
      const arrayIndex = 2;
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'bytesArray', arrayIndex);
      expect(value).to.eql(bytesArray[arrayIndex]);
    });

    it('get value of string type array by index', async () => {
      const arrayIndex = 1;
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'stringArray', arrayIndex);
      expect(value).to.eql(stringArray[arrayIndex]);
    });

    it('get value of map type array by index', async () => {
      // Set map array values.
      const addresses = generateDummyAddresses(3);

      const mapArrayPromises = addresses.map(async (address, index) => {
        const map = new Map();
        map.set(address, BigInt(index * 10));
        const transaction = await testFixedArrays.setMapArray(address, map.get(address), index);
        await transaction.wait();
        return map;
      });

      const arrayIndex = 2;
      const mapKey = addresses[2];
      const mapArray = await Promise.all(mapArrayPromises);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'mapArray', arrayIndex, mapKey);
      expect(value).to.equal(mapArray[arrayIndex].get(mapKey));
    });
  });

  describe('dynamic sized arrays', () => {
    let testDynamicArrays: Contract, storageLayout: StorageLayout;

    before(async () => {
      const TestFixedArrays = await ethers.getContractFactory('TestDynamicArrays');
      testDynamicArrays = await TestFixedArrays.deploy();
      await testDynamicArrays.deployed();
      storageLayout = await getStorageLayout('TestDynamicArrays');
    });

    // Get all elements of array.
    it('get value for dynamic sized array of boolean type', async () => {
      const boolArray = [true, false, false, true, false];
      const transaction = await testDynamicArrays.setBoolArray(boolArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'boolArray');
      expect(value).to.eql(boolArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(boolArray.length);

      // Get value by index.
      const arrayIndex = 2;
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'boolArray', arrayIndex));
      expect(value).to.equal(boolArray[arrayIndex]);
    });

    it('get value for dynamic sized array of unsigned integer type', async () => {
      const uint128Array = [100, 200, 300, 400, 500];
      const transaction = await testDynamicArrays.setUintArray(uint128Array);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'uintArray');
      expect(value).to.eql(uint128Array.map(el => BigInt(el)));
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(uint128Array.length);

      // Get value by index.
      const arrayIndex = 3;
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'uintArray', arrayIndex));
      expect(value).to.equal(BigInt(uint128Array[arrayIndex]));
    });

    it('get value for dynamic sized array of signed integer type', async () => {
      const intArray = [10, 20, 30, 40, 50];
      const transaction = await testDynamicArrays.setIntArray(intArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'intArray');
      expect(value).to.eql(intArray.map(el => BigInt(el)));
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(intArray.length);

      // Get value by index.
      const arrayIndex = 1;
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'intArray', arrayIndex));
      expect(value).to.equal(BigInt(intArray[arrayIndex]));
    });

    it('get value for dynamic sized array of address type', async () => {
      const addressArray = generateDummyAddresses(9);
      const transaction = await testDynamicArrays.setAddressArray(addressArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'addressArray');
      expect(value).to.eql(addressArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(addressArray.length);

      // Get value by index.
      const arrayIndex = 4;
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'addressArray', arrayIndex));
      expect(value).to.equal(addressArray[arrayIndex]);
    });

    it('get value for dynamic sized array of fixed size byte array', async () => {
      const fixedBytesArray = Array.from({ length: 4 }, () => ethers.utils.hexlify(ethers.utils.randomBytes(10)));
      const transaction = await testDynamicArrays.setFixedBytesArray(fixedBytesArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'fixedBytesArray');
      expect(value).to.eql(fixedBytesArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(fixedBytesArray.length);

      // Get value by index.
      const arrayIndex = 2;
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'fixedBytesArray', arrayIndex));
      expect(value).to.equal(fixedBytesArray[arrayIndex]);
    });

    it('get value for dynamic sized array of enum type', async () => {
      const enumArray = [0, 1, 2, 3];
      const transaction = await testDynamicArrays.setEnumArray(enumArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'enumArray');
      expect(value).to.eql(enumArray.map(el => BigInt(el)));
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(enumArray.length);

      // Get value by index.
      const arrayIndex = 2;
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'enumArray', arrayIndex));
      expect(value).to.equal(BigInt(enumArray[arrayIndex]));
    });

    it('get value for dynamic sized array of bytes', async () => {
      const bytesArray = Array.from({ length: 4 }, () => {
        const bytesLength = Math.floor(Math.random() * 64);
        return ethers.utils.hexlify(ethers.utils.randomBytes(bytesLength));
      });

      const transaction = await testDynamicArrays.setBytesArray(bytesArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'bytesArray');
      expect(value).to.eql(bytesArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(bytesArray.length);

      // Get value by index.
      const arrayIndex = 2;
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'bytesArray', arrayIndex));
      expect(value).to.equal(bytesArray[arrayIndex]);
    });

    it('get value for dynamic sized array of string type', async () => {
      const stringArray = ['abc', 'defgh', 'ij', 'k'];

      const transaction = await testDynamicArrays.setStringArray(stringArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'stringArray');
      expect(value).to.eql(stringArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(stringArray.length);

      // Get value by index.
      const arrayIndex = 1;
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'stringArray', arrayIndex));
      expect(value).to.equal(stringArray[arrayIndex]);
    });

    describe('get value for dynamic sized array of struct type', async () => {
      const structArray: Array<{[key: string]: any}> = [];
      let blockHash: string;
      const transactions: Array<ContractTransaction> = [];

      before(async () => {
        for (let i = 0; i < 5; i++) {
          const structElement = {
            int1: BigInt(i + 1),
            uint1: BigInt(i + 2),
            bool1: Boolean(i % 2)
          };

          structArray[i] = structElement;
          transactions.push(await testDynamicArrays.addStructArrayElement(structElement));
        }

        await Promise.all(transactions.map(transaction => transaction.wait()));
        blockHash = await getBlockHash();
      });

      it('get whole array', async () => {
        const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'structArray');
        expect(value).to.eql(structArray);
        const proofData = JSON.parse(proof.data);
        expect(proofData.length).to.equal(structArray.length);
      });

      it('get array element by index', async () => {
        const arrayIndex = 3;
        const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'structArray', arrayIndex);
        expect(value).to.eql(structArray[arrayIndex]);
      });

      it('get struct member value from array element', async () => {
        const arrayIndex = 2;
        const structMember = 'uint1';
        const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'structArray', arrayIndex, structMember);
        expect(value).to.eql(structArray[arrayIndex][structMember]);
      });
    });

    it('get value for dynamic sized array of mapping type', async () => {
      const addresses = generateDummyAddresses(5);
      const mapArray = [];
      const transactions = [];

      for (const [index, address] of addresses.entries()) {
        const map = new Map();
        map.set(address, BigInt(index * 10));
        mapArray.push(map);
        transactions.push(await testDynamicArrays.addMapArrayElement(address, map.get(address)));
      }

      await Promise.all(transactions.map(transaction => transaction.wait()));
      const blockHash = await getBlockHash();
      const arrayIndex = 2;
      const mapKey = addresses[2];
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'mapArray', arrayIndex, mapKey);
      expect(value).to.equal(mapArray[arrayIndex].get(mapKey));
    });
  });

  describe('nested arrays', () => {
    let testNestedArrays: Contract, storageLayout: StorageLayout, blockHash: string;
    const nestedStructArray: Array<Array<{[key: string]: any}>> = [];
    const nestedAddressArray: Array<Array<string>> = [];

    const nestedFixedDynamicArray = [
      [1, 2, 3].map(BigInt),
      [4, 5, 6].map(BigInt)
    ];

    const nestedDynamicArray = [
      [1, 2, 3, 4].map(BigInt),
      [5, 6].map(BigInt),
      [7, 8, 9, 10, 11, 12].map(BigInt),
      [13, 14, 15].map(BigInt)
    ];

    before(async () => {
      const TestNestedArrays = await ethers.getContractFactory('TestNestedArrays');
      testNestedArrays = await TestNestedArrays.deploy();
      await testNestedArrays.deployed();
      storageLayout = await getStorageLayout('TestNestedArrays');
      const transactions = [];

      const addresses = generateDummyAddresses(7);
      const transactionPromises = [];

      // Set value for nestedStructArray.
      for (let i = 0; i < 5; i++) {
        nestedStructArray[i] = [];

        for (let j = 0; j < 3; j++) {
          const value = {
            uint1: BigInt((i + j) * 100),
            address1: addresses[(i + j) % 5]
          };

          nestedStructArray[i][j] = value;

          // Set value in contract.
          transactionPromises.push(testNestedArrays.setNestedStructArray(i, j, value));
        }
      }

      transactions.push(...await Promise.all(transactionPromises));

      // Set value for nestedAddressArray.
      for (let i = 0; i < 3; i++) {
        nestedAddressArray[i] = addresses.slice(i, i + 4);
      }

      transactions.push(await testNestedArrays.setNestedAddressArray(nestedAddressArray));

      // Set value for nested dynamic arrays
      transactions.push(await testNestedArrays.setNestedFixedDynamicArray(nestedFixedDynamicArray));
      transactions.push(await testNestedArrays.setNestedDynamicFixedArray(nestedDynamicArray));
      transactions.push(await testNestedArrays.setNestedDynamicArray(nestedDynamicArray));

      await Promise.all(transactions.map(transaction => transaction.wait()));
      blockHash = await getBlockHash();
    });

    // Get all elements of array.
    it('get value for fixed size nested array of struct type', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedStructArray');
      expect(value).to.eql(nestedStructArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(nestedStructArray.length);
      expect(proofData[0].length).to.equal(nestedStructArray[0].length);
      expect(proofData[0]).to.have.all.keys(Object.keys(nestedStructArray[0]));
    });

    it('get value for fixed size nested array of address type', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedAddressArray');
      expect(value).to.eql(nestedAddressArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(nestedAddressArray.length);
      expect(proofData[0].length).to.equal(nestedAddressArray[0].length);
    });

    it('get value for nested fixed dynamic array of integer type', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedFixedDynamicArray');
      expect(value).to.eql(nestedFixedDynamicArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(nestedFixedDynamicArray.length);
      expect(proofData[0].length).to.equal(nestedFixedDynamicArray[0].length);
    });

    it('get value for nested dynamic fixed array of integer type', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedDynamicFixedArray');
      expect(value).to.eql(nestedDynamicArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(nestedDynamicArray.length);
      expect(proofData[0].length).to.equal(nestedDynamicArray[0].length);
    });

    it('get value for nested dynamic array of integer type', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedDynamicArray');
      expect(value).to.eql(nestedDynamicArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(nestedDynamicArray.length);
      expect(proofData[0].length).to.equal(nestedDynamicArray[0].length);
    });

    // Get element of array by index.
    it('get value of fixed size struct type nested array by index', async () => {
      const arrayIndex = 2;
      const nestedArrayIndex = 1;
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedStructArray', arrayIndex, nestedArrayIndex);
      expect(value).to.eql(nestedStructArray[arrayIndex][nestedArrayIndex]);

      const structMember = 'address1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedStructArray', arrayIndex, nestedArrayIndex, structMember));
      expect(value).to.equal(nestedStructArray[arrayIndex][nestedArrayIndex][structMember]);
    });

    it('get value of fixed size address type nested array by index', async () => {
      const arrayIndex = 2;
      const nestedArrayIndex = 1;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedAddressArray', arrayIndex, nestedArrayIndex);
      expect(value).to.eql(nestedAddressArray[arrayIndex][nestedArrayIndex]);
    });

    it('get value of dynamically sized nested array by index', async () => {
      // Test for variable nestedFixedDynamicArray.
      let arrayIndex = 1;
      let nestedArrayIndex = 2;
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedFixedDynamicArray', arrayIndex, nestedArrayIndex);
      expect(value).to.eql(nestedFixedDynamicArray[arrayIndex][nestedArrayIndex]);

      // Test for variable nestedDynamicFixedArray.
      arrayIndex = 2;
      nestedArrayIndex = 3;
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedDynamicFixedArray', arrayIndex, nestedArrayIndex));
      expect(value).to.eql(nestedDynamicArray[arrayIndex][nestedArrayIndex]);

      // Test for variable nestedDynamicArray.
      arrayIndex = 3;
      nestedArrayIndex = 2;
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedArrays.address, 'nestedDynamicArray', arrayIndex, nestedArrayIndex));
      expect(value).to.eql(nestedDynamicArray[arrayIndex][nestedArrayIndex]);
    });
  });

  describe('structs with value type members', () => {
    let testValueStructs: Contract, storageLayout: StorageLayout;
    let addressStruct: { [key: string]: any }, contractStruct: { [key: string]: any };

    const singleSlotStruct = {
      int1: BigInt(123),
      uint1: BigInt(4)
    };

    const multipleSlotStruct: { [key: string]: any } = {
      uint1: BigInt(123),
      bool1: false,
      int1: BigInt(456)
    };

    const fixedBytesStruct = {
      uint1: BigInt(123),
      bytesTen: ethers.utils.hexlify(ethers.utils.randomBytes(10)),
      bytesTwenty: ethers.utils.hexlify(ethers.utils.randomBytes(20))
    };

    const enumStruct = {
      uint1: BigInt(123),
      choice1: BigInt(2),
      choice2: BigInt(3)
    };

    before(async () => {
      const TestValueStructs = await ethers.getContractFactory('TestValueStructs');
      testValueStructs = await TestValueStructs.deploy();
      await testValueStructs.deployed();
      storageLayout = await getStorageLayout('TestValueStructs');

      const [address1, address2] = generateDummyAddresses(2);

      addressStruct = {
        int1: BigInt(123),
        address1,
        address2,
        uint1: BigInt(456)
      };

      const Contract = await ethers.getContractFactory('TestContractTypes');
      const contract = await Contract.deploy();
      await contract.deployed();

      contractStruct = {
        uint1: BigInt(123),
        testContract: contract.address.toLowerCase()
      };
    });

    // Get all members of a struct.
    it('get value for struct using a single slot', async () => {
      const transaction = await testValueStructs.setSingleSlotStruct(singleSlotStruct.int1, singleSlotStruct.uint1);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'singleSlotStruct');
      expect(value).to.eql(singleSlotStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys('int1', 'uint1');
    });

    it('get value for struct using multiple slots', async () => {
      const transaction = await testValueStructs.setMultipleSlotStruct(multipleSlotStruct.uint1, multipleSlotStruct.bool1, multipleSlotStruct.int1);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'multipleSlotStruct');
      expect(value).to.eql(multipleSlotStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys(Object.keys(multipleSlotStruct));
    });

    it('get value for struct with address type members', async () => {
      const transaction = await testValueStructs.setAddressStruct(addressStruct);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'addressStruct');
      expect(value).to.eql(addressStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys(Object.keys(addressStruct));
    });

    it('get value for struct with contract type members', async () => {
      const transaction = await testValueStructs.setContractStruct(contractStruct.uint1, contractStruct.testContract);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'contractStruct');
      expect(value).to.eql(contractStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys(Object.keys(contractStruct));
    });

    it('get value for struct with fixed-sized byte array members', async () => {
      const transaction = await testValueStructs.setFixedBytesStruct(fixedBytesStruct.uint1, fixedBytesStruct.bytesTen, fixedBytesStruct.bytesTwenty);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'fixedBytesStruct');
      expect(value).to.eql(fixedBytesStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys('uint1', 'bytesTen', 'bytesTwenty');
    });

    it('get value for struct with enum type members', async () => {
      const transaction = await testValueStructs.setEnumStruct(enumStruct.uint1, enumStruct.choice1, enumStruct.choice2);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'enumStruct');
      expect(value).to.eql(enumStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys('uint1', 'choice1', 'choice2');
    });

    // Get value of a member in a struct
    it('get value of signed integer type member in a struct', async () => {
      const member = 'int1';
      const transaction = await testValueStructs.setSingleSlotStruct(singleSlotStruct.int1, singleSlotStruct.uint1);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'singleSlotStruct', member);
      expect(value).to.equal(singleSlotStruct[member]);
    });

    it('get value of unsigned integer type member in a struct', async () => {
      const member = 'uint1';
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'singleSlotStruct', member);
      expect(value).to.equal(singleSlotStruct[member]);
    });

    it('get value of boolean type member in a struct', async () => {
      const transaction = await testValueStructs.setMultipleSlotStruct(multipleSlotStruct.uint1, multipleSlotStruct.bool1, multipleSlotStruct.int1);
      await transaction.wait();
      const blockHash = await getBlockHash();

      let member = 'bool1';
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'multipleSlotStruct', member);
      expect(value).to.equal(multipleSlotStruct[member]);

      member = 'int1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'multipleSlotStruct', member));
      expect(value).to.equal(multipleSlotStruct[member]);

      member = 'uint1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'multipleSlotStruct', member));
      expect(value).to.equal(multipleSlotStruct[member]);
    });

    it('get value of address type member in a struct', async () => {
      const transaction = await testValueStructs.setAddressStruct(addressStruct);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let member = 'address1';
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'addressStruct', member);
      expect(value).to.equal(addressStruct[member]);

      member = 'uint1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'addressStruct', member));
      expect(value).to.equal(addressStruct[member]);
    });

    it('get value of contract type member in a struct', async () => {
      const member = 'testContract';
      const transaction = await testValueStructs.setContractStruct(contractStruct.uint1, contractStruct.testContract);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'contractStruct', member);
      expect(value).to.equal(contractStruct[member]);
    });

    it('get value of fixed byte array member in a struct', async () => {
      const member = 'bytesTen';
      const transaction = await testValueStructs.setFixedBytesStruct(fixedBytesStruct.uint1, fixedBytesStruct.bytesTen, fixedBytesStruct.bytesTwenty);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'fixedBytesStruct', member);
      expect(value).to.equal(fixedBytesStruct[member]);
    });

    it('get value of enum type member in a struct', async () => {
      const member = 'choice2';
      const transaction = await testValueStructs.setEnumStruct(enumStruct.uint1, enumStruct.choice1, enumStruct.choice2);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'enumStruct', member);
      expect(value).to.equal(enumStruct[member]);
    });
  });

  describe('structs with reference type members', () => {
    let testReferenceStructs: Contract, storageLayout: StorageLayout;

    let fixedArrayStruct: {[key: string]: any},
      bytesStruct: {[key: string]: any},
      stringStruct: {[key: string]: any},
      nestedStruct: {[key: string]: any},
      dynamicArrayStruct: {[key: string]: any};

    before(async () => {
      const TestReferenceStructs = await ethers.getContractFactory('TestReferenceStructs');
      testReferenceStructs = await TestReferenceStructs.deploy();
      await testReferenceStructs.deployed();
      storageLayout = await getStorageLayout('TestReferenceStructs');

      const addresses = generateDummyAddresses(5);

      fixedArrayStruct = {
        int1: BigInt(123),
        uintArray: [1, 2, 3, 4].map(el => BigInt(el)),
        addressArray: addresses.slice(0, 3)
      };

      bytesStruct = {
        byteArray: ethers.utils.hexlify(ethers.utils.randomBytes(40)),
        address1: addresses[1],
        uint1: BigInt(1234)
      };

      stringStruct = {
        string1: 'string1',
        int1: BigInt(123),
        uint1: BigInt(456),
        string2: 'string2',
        address1: addresses[2],
        bool1: false
      };

      nestedStruct = {
        bytesStruct,
        address1: addresses[3]
      };

      dynamicArrayStruct = {
        address1: addresses[4],
        uintArray: [1, 2, 3, 4, 5].map(BigInt)
      };
    });

    // Get all members of a struct.
    it('get value for struct with fixed-size array members', async () => {
      const transaction = await testReferenceStructs.setFixedArrayStruct(fixedArrayStruct.int1, fixedArrayStruct.uintArray, fixedArrayStruct.addressArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'fixedArrayStruct');
      expect(value).to.eql(fixedArrayStruct);
    });

    it('get value for struct with dynamically sized byte members', async () => {
      const transaction = await testReferenceStructs.setBytesStruct(bytesStruct);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'bytesStruct');
      expect(value).to.eql(bytesStruct);
    });

    it('get value for struct with string type members', async () => {
      const transaction = await testReferenceStructs.setStringStruct(stringStruct);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'stringStruct');
      expect(value).to.eql(stringStruct);
    });

    it('get value for struct with dynamic array members', async () => {
      const transaction = await testReferenceStructs.setDynamicArrayStruct(dynamicArrayStruct);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'dynamicArrayStruct');
      expect(value).to.eql(dynamicArrayStruct);
    });

    it('get value for nested struct with struct type members', async () => {
      const transaction = await testReferenceStructs.setNestedStruct(nestedStruct);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'nestedStruct');
      expect(value).to.eql(nestedStruct);
    });

    // Get value of a member in a struct
    it('get value of fixed-size array member in a struct', async () => {
      const member = 'uintArray';
      const transaction = await testReferenceStructs.setFixedArrayStruct(fixedArrayStruct.int1, fixedArrayStruct.uintArray, fixedArrayStruct.addressArray);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'fixedArrayStruct', member);
      expect(value).to.eql(fixedArrayStruct[member]);
    });

    it('get value of bytes member in a struct', async () => {
      const member = 'byteArray';
      const transaction = await testReferenceStructs.setBytesStruct(bytesStruct);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'bytesStruct', member);
      expect(value).to.equal(bytesStruct[member]);
    });

    it('get value of string member in a struct', async () => {
      const member = 'string2';
      const transaction = await testReferenceStructs.setStringStruct(stringStruct);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'stringStruct', member);
      expect(value).to.eql(stringStruct[member]);
    });

    it('get value of dynamic array member in a struct', async () => {
      const member = 'uintArray';
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'dynamicArrayStruct', member);
      expect(value).to.eql(dynamicArrayStruct[member]);
    });

    it('get value of mapping type member in a struct', async () => {
      const [signer1] = await ethers.getSigners();
      const [address2] = generateDummyAddresses(1);

      const valueMappingStruct: { [key: string]: any } = {
        uintAddressMap: new Map(),
        uint1: 123,
        addressIntMap: new Map()
      };

      const mappingKey = 456;
      valueMappingStruct.uintAddressMap.set(mappingKey, signer1.address.toLowerCase());
      valueMappingStruct.addressIntMap.set(address2, 789);
      let member = 'uintAddressMap';

      let transaction = await testReferenceStructs.setValueMappingStruct(mappingKey, valueMappingStruct.uintAddressMap.get(mappingKey), valueMappingStruct.uint1, address2, valueMappingStruct.addressIntMap.get(address2));
      await transaction.wait();
      let blockHash = await getBlockHash();
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'valueMappingStruct', member, mappingKey);
      expect(value).to.equal(valueMappingStruct[member].get(mappingKey));

      // Get value for structs with mapping of reference type keys.
      const referenceMappingStruct: { [key: string]: any } = {
        bytesAddressMap: new Map(),
        stringUintMap: new Map()
      };

      const bytesKey = ethers.utils.hexlify(ethers.utils.randomBytes(40));
      const stringKey = 'abc';
      referenceMappingStruct.bytesAddressMap.set(bytesKey, signer1.address.toLowerCase());
      referenceMappingStruct.stringUintMap.set(stringKey, BigInt(123));
      member = 'stringUintMap';

      transaction = await testReferenceStructs.setReferenceMappingStruct(bytesKey, referenceMappingStruct.bytesAddressMap.get(bytesKey), stringKey, referenceMappingStruct.stringUintMap.get(stringKey));
      await transaction.wait();
      blockHash = await getBlockHash();
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'referenceMappingStruct', member, stringKey));
      expect(value).to.equal(referenceMappingStruct[member].get(stringKey));
    });

    it('get value of nested struct member', async () => {
      const transaction = await testReferenceStructs.setNestedStruct(nestedStruct);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const member = 'bytesStruct';
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'nestedStruct', member);
      expect(value).to.eql(nestedStruct[member]);

      // Get value inside the nested struct member.
      let nestedMember = 'address1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'nestedStruct', member, nestedMember));
      expect(value).to.eql(nestedStruct[member][nestedMember]);

      nestedMember = 'byteArray';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'nestedStruct', member, nestedMember));
      expect(value).to.eql(nestedStruct[member][nestedMember]);
    });
  });

  describe('basic mapping type', () => {
    let testMappingTypes: Contract, storageLayout: StorageLayout;

    before(async () => {
      const TestMappingTypes = await ethers.getContractFactory('TestBasicMapping');
      testMappingTypes = await TestMappingTypes.deploy();
      await testMappingTypes.deployed();
      storageLayout = await getStorageLayout('TestBasicMapping');
    });

    // Tests for value type keys.
    it('get value for mapping with address type keys', async () => {
      const expectedValue = 123;
      const [signer1] = await ethers.getSigners();
      const transaction = await testMappingTypes.connect(signer1).setAddressUintMap(expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'addressUintMap', signer1.address);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for mapping with boolean type keys', async () => {
      const expectedValue = 123;
      const mapKey = true;
      const transaction = await testMappingTypes.setBoolIntMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'boolIntMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for mapping with signed integer type keys', async () => {
      const mapKey = 123;
      const [address1] = generateDummyAddresses(1);
      const transaction = await testMappingTypes.setIntAddressMap(mapKey, address1);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intAddressMap', mapKey);
      expect(value).to.equal(address1);
    });

    it('get value for mapping with unsigned integer type keys', async () => {
      const expectedValue = ethers.utils.hexlify(ethers.utils.randomBytes(16));
      const mapKey = 123;
      const transaction = await testMappingTypes.setUintBytesMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'uintBytesMap', mapKey);
      expect(value).to.equal(expectedValue);
    });

    // TODO: Fix getting value for mapping with keys as fixed-size byte array
    // Zero value is returned if using fixed-sized byte array keys of length less than 32 bytes
    // Type Bytes32 works whereas types like bytes16, bytes24 do not work.
    it.skip('get value for mapping with fixed-size byte array keys', async () => {
      const mapKey = ethers.utils.hexlify(ethers.utils.randomBytes(8));
      const [, signer1] = await ethers.getSigners();
      const transaction = await testMappingTypes.setBytesAddressMap(mapKey, signer1.address);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'bytesAddressMap', mapKey);
      expect(value).to.equal(signer1.address);
    });

    it('get value for mapping with enum type keys', async () => {
      const mapKey = 1;
      const expectedValue = 123;
      const transaction = await testMappingTypes.setEnumIntMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'enumIntMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    // Tests for reference type keys.
    it('get value for mapping with string type keys', async () => {
      const mapKey = 'abc';
      const expectedValue = 123;
      const transaction = await testMappingTypes.setStringIntMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'stringIntMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for mapping with dynamically-sized byte array as keys', async () => {
      const mapKey = ethers.utils.hexlify(ethers.utils.randomBytes(64));
      const expectedValue = 123;
      const transaction = await testMappingTypes.setBytesUintMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'bytesUintMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    // Tests for reference type values.
    it('get value for mapping with struct type values', async () => {
      const [signer1] = await ethers.getSigners();

      const expectedValue: {[key: string]: any} = {
        uint1: BigInt(123),
        int1: BigInt(456),
        bool1: true,
        address1: signer1.address.toLowerCase()
      };

      const mapKey = 123;
      const transaction = await testMappingTypes.setIntStructMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intStructMap', mapKey);
      expect(value).to.eql(expectedValue);

      // Get value of specified struct member in mapping.
      let structMember = 'bool1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intStructMap', mapKey, structMember));
      expect(value).to.equal(expectedValue[structMember]);

      structMember = 'address1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intStructMap', mapKey, structMember));
      expect(value).to.equal(expectedValue[structMember]);
    });

    it('get value for mapping of fixed size bytes keys and struct type values', async () => {
      const [signer1] = await ethers.getSigners();

      const expectedValue = {
        uint1: BigInt(123),
        int1: BigInt(456),
        bool1: true,
        address1: signer1.address.toLowerCase()
      };

      const mapKey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const transaction = await testMappingTypes.setFixedBytesStructMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'fixedBytesStructMap', mapKey);
      expect(value).to.eql(expectedValue);

      // Get value of specified struct member in mapping.
      const structMember = 'int1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'fixedBytesStructMap', mapKey, structMember));
      expect(value).to.equal(expectedValue[structMember]);
    });

    it('get value for mapping of address type keys and struct type values', async () => {
      const [address1, address2] = generateDummyAddresses(2);

      const expectedValue = {
        uint1: BigInt(123),
        int1: BigInt(456),
        bool1: true,
        address1: address1
      };

      const mapKey = address2;
      const transaction = await testMappingTypes.setAddressStructMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'addressStructMap', mapKey);
      expect(value).to.eql(expectedValue);
    });

    it('get value for mapping of unsigned integer keys and fixed-size array values', async () => {
      const mapKey = 123;
      const expectedValue = generateDummyAddresses(3);
      const transaction = await testMappingTypes.setUintFixedArrayMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'uintFixedArrayMap', mapKey);
      expect(value).to.eql(expectedValue);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(expectedValue.length);
    });

    it('get value for mapping of signed integer keys and dynamically-sized array values', async () => {
      const mapKey = 123;
      const expectedValue = [1, 2, 3, 4, 5, 6, 7, 8];

      const transaction = await testMappingTypes.setIntDynamicArrayMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intDynamicArrayMap', mapKey);
      expect(value).to.eql(expectedValue.map(BigInt));
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(expectedValue.length);
    });

    it('get value for mapping of address keys and dynamic byte array values', async () => {
      const [signer1] = await ethers.getSigners();
      const expectedValue = ethers.utils.hexlify(ethers.utils.randomBytes(42));

      const transaction = await testMappingTypes.setAddressBytesMap(signer1.address, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'addressBytesMap', signer1.address);
      expect(value).to.eql(expectedValue);
    });

    it('get value for mapping of fixed size byte array keys and string type values', async () => {
      const mapKey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const expectedValue = 'Hello world.';

      const transaction = await testMappingTypes.setBytesStringMap(mapKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'bytesStringMap', mapKey);
      expect(value).to.eql(expectedValue);
    });
  });

  describe('nested mapping type', () => {
    let testNestedMapping: Contract, storageLayout: StorageLayout;

    before(async () => {
      const TestNestedMapping = await ethers.getContractFactory('TestNestedMapping');
      testNestedMapping = await TestNestedMapping.deploy();
      await testNestedMapping.deployed();
      storageLayout = await getStorageLayout('TestNestedMapping');
    });

    it('get value for nested mapping with address type keys', async () => {
      const expectedValue = 123;
      const [signer1] = await ethers.getSigners();
      const [address2] = generateDummyAddresses(1);
      const transaction = await testNestedMapping.connect(signer1).setNestedAddressUintMap(address2, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'nestedAddressUintMap', signer1.address, address2);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for nested mapping with signed integer type keys', async () => {
      const expectedValue = false;
      const key = 123;
      const [address1] = generateDummyAddresses(1);
      const transaction = await testNestedMapping.setIntAddressBoolMap(key, address1, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'intAddressBoolMap', key, address1);
      expect(value).to.equal(expectedValue);
    });

    it('get value for nested mapping with unsigned integer type keys', async () => {
      const expectedValue = 123;
      const key = 456;
      const nestedKey = 'abc';
      const transaction = await testNestedMapping.setUintStringIntMap(key, nestedKey, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'uintStringIntMap', key, nestedKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for nested mapping with dynamically-sized byte array as keys', async () => {
      const key = ethers.utils.hexlify(ethers.utils.randomBytes(64));
      const nestedKey = 123;
      const [address1] = generateDummyAddresses(1);
      const transaction = await testNestedMapping.setBytesIntAddressMap(key, nestedKey, address1);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'bytesIntAddressMap', key, nestedKey);
      expect(value).to.equal(address1);
    });

    it('get value for nested mapping with string type keys', async () => {
      const key = 'abc';
      const expectedValue = 123;
      const [address1] = generateDummyAddresses(1);
      const transaction = await testNestedMapping.setStringAddressIntMap(key, address1, expectedValue);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'stringAddressIntMap', key, address1);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for double nested mapping with address type keys', async () => {
      const [address1, address2, address3] = generateDummyAddresses(3);
      const uintKey = 123;
      const transaction = await testNestedMapping.setDoubleNestedAddressMap(address1, address2, uintKey, address3);
      await transaction.wait();
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'doubleNestedAddressMap', address1, address2, uintKey);
      expect(value).to.equal(address3);
    });
  });
});
