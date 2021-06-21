/* eslint-disable @typescript-eslint/no-explicit-any */
import { Contract } from '@ethersproject/contracts';
import { expect } from 'chai';
import '@nomiclabs/hardhat-ethers';
import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { getStorageInfo, getStorageValue, StorageLayout } from './storage';
import { getStorageLayout, getStorageAt as rpcGetStorageAt, generateDummyAddresses } from '../test/utils';

const CONTRACTS = [
  'TestIntegers',
  'TestUnsignedIntegers',
  'TestBooleans',
  'TestAddress',
  'TestContractTypes',
  'TestBytes',
  'TestEnums',
  'TestStrings',
  'TestFixedArrays',
  'TestDynamicArrays',
  'TestNestedArrays',
  'TestValueStructs',
  'TestReferenceStructs',
  'TestBasicMapping',
  'TestNestedMapping'
];

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
    const storageLayout = await getStorageLayout(name);

    const storageInfo = getStorageInfo(storageLayout, variable);
    expect(storageInfo).to.include(output);
  });

  await Promise.all(testPromises);
});

type Contracts = {[key: string]: { contract: Contract, storageLayout: StorageLayout }}

describe('Get value from storage', () => {
  const getBlockHash = async () => {
    const blockNumber = await ethers.provider.getBlockNumber();
    const { hash } = await ethers.provider.getBlock(blockNumber);
    return hash;
  };

  let contracts: Contracts;

  before(async () => {
    const contractPromises = CONTRACTS.map(async name => {
      const Contract = await ethers.getContractFactory(name);
      const contract = await Contract.deploy();
      await contract.deployed();
      const storageLayout = await getStorageLayout(name);

      return { contract, storageLayout, name };
    });

    const contractData = await Promise.all(contractPromises);

    contracts = contractData.reduce((acc: Contracts, contract) => {
      const { name, ...data } = contract;
      acc[name] = data;
      return acc;
    }, {});
  });

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
    let integers: Contract, storageLayout: StorageLayout, blockHash: string;
    const int1Value = 12;
    const int2Value = 34;
    const int3Value = 123;

    before(async () => {
      ({ contract: integers, storageLayout } = contracts.TestIntegers);

      const transactions = await Promise.all([
        integers.setInt1(int1Value),
        integers.setInt2(int2Value),
        integers.setInt3(int3Value)
      ]);

      await Promise.all(transactions.map(transaction => transaction.wait()));
      blockHash = await getBlockHash();
    });

    it('get value for integer type variables packed together', async () => {
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, integers.address, 'int1');
      expect(value).to.equal(BigInt(int1Value));

      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, integers.address, 'int2'));
      expect(value).to.equal(BigInt(int2Value));
    });

    it('get value for integer type variables using single slot', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, integers.address, 'int3');
      expect(value).to.equal(BigInt(int3Value));
    });
  });

  describe('unsigned integer type', () => {
    let unsignedIntegers: Contract, storageLayout: StorageLayout, blockHash: string;
    const uint1Value = 12;
    const uint2Value = 34;
    const uint3Value = 123;

    before(async () => {
      ({ contract: unsignedIntegers, storageLayout } = contracts.TestUnsignedIntegers);

      const transactions = await Promise.all([
        unsignedIntegers.setUint1(uint1Value),
        unsignedIntegers.setUint2(uint2Value),
        unsignedIntegers.setUint3(uint3Value)
      ]);

      await Promise.all(transactions.map(transaction => transaction.wait()));
      blockHash = await getBlockHash();
    });

    it('get value for unsigned integer type variables packed together', async () => {
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, unsignedIntegers.address, 'uint1');
      expect(value).to.equal(BigInt(uint1Value));

      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, unsignedIntegers.address, 'uint2'));
      expect(value).to.equal(BigInt(uint2Value));
    });

    it('get value for unsigned integer type variables using single slot', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, unsignedIntegers.address, 'uint3');
      expect(value).to.equal(BigInt(uint3Value));
    });
  });

  it('get value for boolean type', async () => {
    const { contract: booleans, storageLayout } = contracts.TestBooleans;
    const bool1Value = true;
    const bool2Value = false;

    const transactions = await Promise.all([
      booleans.setBool1(bool1Value),
      booleans.setBool2(bool2Value)
    ]);

    await Promise.all(transactions.map(transaction => transaction.wait()));
    const blockHash = await getBlockHash();

    let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, booleans.address, 'bool1');
    expect(value).to.equal(bool1Value);

    ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, booleans.address, 'bool2'));
    expect(value).to.equal(bool2Value);
  });

  it('get value for address type', async () => {
    const { contract: address, storageLayout } = contracts.TestAddress;
    const [signer] = await ethers.getSigners();
    const transaction = await address.setAddress1(signer.address);
    await transaction.wait();
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, address.address, 'address1');
    expect(value).to.be.a('string');
    expect(String(value).toLowerCase()).to.equal(signer.address.toLowerCase());
  });

  it('get value for contract type', async () => {
    const { contract: testAddress } = contracts.TestAddress;
    const { contract: testContractTypes, storageLayout } = contracts.TestContractTypes;
    const transaction = await testContractTypes.setAddressContract1(testAddress.address);
    await transaction.wait();
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testContractTypes.address, 'addressContract1');
    expect(value).to.equal(testAddress.address.toLowerCase());
  });

  it('get value for fixed size byte arrays packed together', async () => {
    const { contract: testBytes, storageLayout } = contracts.TestBytes;
    const bytesTenValue = ethers.utils.hexlify(ethers.utils.randomBytes(10));
    const bytesTwentyValue = ethers.utils.hexlify(ethers.utils.randomBytes(20));

    const transactions = await Promise.all([
      testBytes.setBytesTen(bytesTenValue),
      testBytes.setBytesTwenty(bytesTwentyValue)
    ]);

    await Promise.all(transactions.map(transaction => transaction.wait()));
    const blockHash = await getBlockHash();

    let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testBytes.address, 'bytesTen');
    expect(value).to.equal(bytesTenValue);

    ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testBytes.address, 'bytesTwenty'));
    expect(value).to.equal(bytesTwentyValue);
  });

  it('get value for fixed size byte arrays using single slot', async () => {
    const { contract: testBytes, storageLayout } = contracts.TestBytes;
    const expectedValue = ethers.utils.hexlify(ethers.utils.randomBytes(30));
    const transaction = await testBytes.setBytesThirty(expectedValue);
    await transaction.wait();
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testBytes.address, 'bytesThirty');
    expect(value).to.equal(expectedValue);
  });

  it('get value for enum types', async () => {
    const { contract: testEnums, storageLayout } = contracts.TestEnums;
    const expectedValue = 1;
    const transaction = await testEnums.setChoicesEnum1(expectedValue);
    await transaction.wait();
    const blockHash = await getBlockHash();
    const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testEnums.address, 'choicesEnum1');
    expect(value).to.equal(BigInt(expectedValue));
  });

  describe('string type', () => {
    let strings: Contract, storageLayout: StorageLayout, blockHash: string;
    const string1Value = 'Hello world.';
    const string2Value = 'This sentence is more than 32 bytes long.';

    before(async () => {
      ({ contract: strings, storageLayout } = contracts.TestStrings);

      const transactions = await Promise.all([
        strings.setString1(string1Value),
        strings.setString2(string2Value)
      ]);

      await Promise.all(transactions.map(transaction => transaction.wait()));
      blockHash = await getBlockHash();
    });

    // Test for string of size less than 32 bytes which use only one slot.
    it('get value for string length less than 32 bytes', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, strings.address, 'string1');
      expect(value).to.equal(string1Value);
    });

    // Test for string of size 32 bytes or more which use multiple slots.
    it('get value for string length more than 32 bytes', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, strings.address, 'string2');
      expect(value).to.equal(string2Value);
    });
  });

  describe('dynamically sized byte array', () => {
    let testBytes: Contract, storageLayout: StorageLayout;

    before(async () => {
      ({ contract: testBytes, storageLayout } = contracts.TestBytes);
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
    let testFixedArrays: Contract, storageLayout: StorageLayout, blockHash: string;
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

    const mapArray = addressArray.slice(0, 3)
      .map((address, index) => {
        const map = new Map();
        map.set(address, BigInt(index * 10));
        return map;
      });

    const fixedBytesArray = Array.from({ length: 5 }, () => ethers.utils.hexlify(ethers.utils.randomBytes(10)));

    const structArray: Array<{[key: string]: any}> = [];

    for (let i = 0; i < 5; i++) {
      const structElement = {
        int1: BigInt(i + 1),
        uint1: BigInt(i + 2),
        bool1: Boolean(i % 2)
      };

      structArray[i] = structElement;
    }

    before(async () => {
      ({ contract: testFixedArrays, storageLayout } = contracts.TestFixedArrays);

      const structArrayTransactions = structArray.map(async (structElement, index) => testFixedArrays.setStructArray(structElement, index));

      const mapArrayTransactions = mapArray.map(async (map, index) => {
        const [key, value] = map.entries().next().value;
        return testFixedArrays.setMapArray(key, value, index);
      });

      const transactions = await Promise.all([
        testFixedArrays.setBoolArray(boolArray),
        testFixedArrays.setUint16Array(uint16Array),
        testFixedArrays.setInt128Array(int128Array),
        testFixedArrays.setUintArray(uint16Array),
        testFixedArrays.setAddressArray(addressArray),
        testFixedArrays.setFixedBytesArray(fixedBytesArray),
        testFixedArrays.setEnumArray(enumArray),
        testFixedArrays.setBytesArray(bytesArray),
        testFixedArrays.setStringArray(stringArray),
        ...structArrayTransactions,
        ...mapArrayTransactions
      ]);

      await Promise.all(transactions.map(transaction => transaction.wait()));
      blockHash = await getBlockHash();
    });

    // Get all elements of array.
    // Test for array variables which are 32 bytes or less and packed into a single slot.
    it('get value for fixed size arrays using single slot', async () => {
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
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'addressArray');
      expect(value).to.eql(addressArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(addressArray.length);
    });

    it('get value for fixed size arrays of fixed size bytes type', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'fixedBytesArray');
      expect(value).to.eql(fixedBytesArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(fixedBytesArray.length);
    });

    it('get value for fixed size arrays of enum type', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'enumArray');
      expect(value).to.eql(enumArray.map(el => BigInt(el)));
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(enumArray.length);
    });

    it('get value for fixed size arrays of dynamic byte array type', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'bytesArray');
      expect(value).to.eql(bytesArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(bytesArray.length);
    });

    it('get value for fixed size arrays of string type', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'stringArray');
      expect(value).to.eql(stringArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(stringArray.length);
    });

    it('get value for fixed size array of struct type', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'structArray');
      expect(value).to.eql(structArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(structArray.length);
    });

    // Get element of array by index.
    it('get value of signed integer type array by index', async () => {
      const arrayIndex = 2;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'int128Array', arrayIndex);
      expect(value).to.equal(BigInt(int128Array[arrayIndex]));
    });

    it('get value of unsigned integer type array by index', async () => {
      const arrayIndex = 3;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'uint16Array', arrayIndex);
      expect(value).to.equal(BigInt(uint16Array[arrayIndex]));
    });

    it('get value of boolean type array by index', async () => {
      const arrayIndex = 0;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'boolArray', arrayIndex);
      expect(value).to.equal(boolArray[arrayIndex]);
    });

    it('get value of address type array by index', async () => {
      const arrayIndex = 1;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'addressArray', arrayIndex);
      expect(value).to.equal(addressArray[arrayIndex]);
    });

    it('get value of enum type array by index', async () => {
      const arrayIndex = 3;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'enumArray', arrayIndex);
      expect(value).to.eql(BigInt(enumArray[arrayIndex]));
    });

    it('get value of struct type array by index', async () => {
      const arrayIndex = 2;
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'structArray', arrayIndex);
      expect(value).to.eql(structArray[arrayIndex]);

      // Get value of specified struct member in array element.
      const structMember = 'uint1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'structArray', arrayIndex, structMember));
      expect(value).to.eql(structArray[arrayIndex][structMember]);
    });

    it('get value of dynamic bytes type array by index', async () => {
      const arrayIndex = 2;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'bytesArray', arrayIndex);
      expect(value).to.eql(bytesArray[arrayIndex]);
    });

    it('get value of string type array by index', async () => {
      const arrayIndex = 1;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'stringArray', arrayIndex);
      expect(value).to.eql(stringArray[arrayIndex]);
    });

    it('get value of map type array by index', async () => {
      const arrayIndex = 2;
      const [mapKey, expectedValue] = mapArray[arrayIndex].entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'mapArray', arrayIndex, mapKey);
      expect(value).to.equal(expectedValue);
    });
  });

  describe('dynamic sized arrays', () => {
    let testDynamicArrays: Contract, storageLayout: StorageLayout, blockHash: string;
    const boolArray = [true, false, false, true, false];
    const uint128Array = [100, 200, 300, 400, 500];
    const intArray = [10, 20, 30, 40, 50];
    const addressArray = generateDummyAddresses(9);

    const mapArray = addressArray.slice(0, 5)
      .map((address, index) => {
        const map = new Map();
        map.set(address, BigInt(index * 10));
        return map;
      });

    const fixedBytesArray = Array.from({ length: 4 }, () => ethers.utils.hexlify(ethers.utils.randomBytes(10)));
    const enumArray = [0, 1, 2, 3];
    const stringArray = ['abc', 'defgh', 'ij', 'k'];

    const bytesArray = Array.from({ length: 4 }, () => {
      const bytesLength = Math.floor(Math.random() * 64);
      return ethers.utils.hexlify(ethers.utils.randomBytes(bytesLength));
    });

    before(async () => {
      ({ contract: testDynamicArrays, storageLayout } = contracts.TestDynamicArrays);

      const transactions = await Promise.all([
        testDynamicArrays.setBoolArray(boolArray),
        testDynamicArrays.setUintArray(uint128Array),
        testDynamicArrays.setIntArray(intArray),
        testDynamicArrays.setAddressArray(addressArray),
        testDynamicArrays.setFixedBytesArray(fixedBytesArray),
        testDynamicArrays.setEnumArray(enumArray),
        testDynamicArrays.setBytesArray(bytesArray),
        testDynamicArrays.setStringArray(stringArray)
      ]);

      for (const map of mapArray) {
        const [key, value] = map.entries().next().value;
        transactions.push(await testDynamicArrays.addMapArrayElement(key, value));
      }

      await Promise.all(transactions.map(transaction => transaction.wait()));
      blockHash = await getBlockHash();
    });

    // Get all elements of array.
    it('get value for dynamic sized array of boolean type', async () => {
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
      const arrayIndex = 2;
      const [mapKey, expectedValue] = mapArray[arrayIndex].entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testDynamicArrays.address, 'mapArray', arrayIndex, mapKey);
      expect(value).to.equal(expectedValue);
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
      ({ contract: testNestedArrays, storageLayout } = contracts.TestNestedArrays);
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
    let testValueStructs: Contract, storageLayout: StorageLayout, blockHash: string;
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
      ({ contract: testValueStructs, storageLayout } = contracts.TestValueStructs);

      const [address1, address2] = generateDummyAddresses(2);

      addressStruct = {
        int1: BigInt(123),
        address1,
        address2,
        uint1: BigInt(456)
      };

      const { contract } = contracts.TestContractTypes;

      contractStruct = {
        uint1: BigInt(123),
        testContract: contract.address.toLowerCase()
      };

      const transactions = await Promise.all([
        testValueStructs.setSingleSlotStruct(singleSlotStruct.int1, singleSlotStruct.uint1),
        testValueStructs.setMultipleSlotStruct(multipleSlotStruct.uint1, multipleSlotStruct.bool1, multipleSlotStruct.int1),
        testValueStructs.setAddressStruct(addressStruct),
        testValueStructs.setContractStruct(contractStruct.uint1, contractStruct.testContract),
        testValueStructs.setFixedBytesStruct(fixedBytesStruct.uint1, fixedBytesStruct.bytesTen, fixedBytesStruct.bytesTwenty),
        testValueStructs.setEnumStruct(enumStruct.uint1, enumStruct.choice1, enumStruct.choice2),
        testValueStructs.setSingleSlotStruct(singleSlotStruct.int1, singleSlotStruct.uint1)
      ]);

      await Promise.all(transactions.map(transaction => transaction.wait()));
      blockHash = await getBlockHash();
    });

    // Get all members of a struct.
    it('get value for struct using a single slot', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'singleSlotStruct');
      expect(value).to.eql(singleSlotStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys('int1', 'uint1');
    });

    it('get value for struct using multiple slots', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'multipleSlotStruct');
      expect(value).to.eql(multipleSlotStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys(Object.keys(multipleSlotStruct));
    });

    it('get value for struct with address type members', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'addressStruct');
      expect(value).to.eql(addressStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys(Object.keys(addressStruct));
    });

    it('get value for struct with contract type members', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'contractStruct');
      expect(value).to.eql(contractStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys(Object.keys(contractStruct));
    });

    it('get value for struct with fixed-sized byte array members', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'fixedBytesStruct');
      expect(value).to.eql(fixedBytesStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys('uint1', 'bytesTen', 'bytesTwenty');
    });

    it('get value for struct with enum type members', async () => {
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'enumStruct');
      expect(value).to.eql(enumStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys('uint1', 'choice1', 'choice2');
    });

    // Get value of a member in a struct
    it('get value of signed integer type member in a struct', async () => {
      const member = 'int1';
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'singleSlotStruct', member);
      expect(value).to.equal(singleSlotStruct[member]);
    });

    it('get value of unsigned integer type member in a struct', async () => {
      const member = 'uint1';
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'singleSlotStruct', member);
      expect(value).to.equal(singleSlotStruct[member]);
    });

    it('get value of boolean type member in a struct', async () => {
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
      let member = 'address1';
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'addressStruct', member);
      expect(value).to.equal(addressStruct[member]);

      member = 'uint1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'addressStruct', member));
      expect(value).to.equal(addressStruct[member]);
    });

    it('get value of contract type member in a struct', async () => {
      const member = 'testContract';
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'contractStruct', member);
      expect(value).to.equal(contractStruct[member]);
    });

    it('get value of fixed byte array member in a struct', async () => {
      const member = 'bytesTen';
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'fixedBytesStruct', member);
      expect(value).to.equal(fixedBytesStruct[member]);
    });

    it('get value of enum type member in a struct', async () => {
      const member = 'choice2';
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'enumStruct', member);
      expect(value).to.equal(enumStruct[member]);
    });
  });

  describe('structs with reference type members', () => {
    let testReferenceStructs: Contract, storageLayout: StorageLayout, blockHash: string;
    const addresses = generateDummyAddresses(5);

    const fixedArrayStruct = {
      int1: BigInt(123),
      uintArray: [1, 2, 3, 4].map(el => BigInt(el)),
      addressArray: addresses.slice(0, 3)
    };

    const bytesStruct = {
      byteArray: ethers.utils.hexlify(ethers.utils.randomBytes(40)),
      address1: addresses[1],
      uint1: BigInt(1234)
    };

    const stringStruct = {
      string1: 'string1',
      int1: BigInt(123),
      uint1: BigInt(456),
      string2: 'string2',
      address1: addresses[2],
      bool1: false
    };

    const nestedStruct: {[key: string]: any} = {
      bytesStruct,
      address1: addresses[3]
    };

    const dynamicArrayStruct = {
      address1: addresses[4],
      uintArray: [1, 2, 3, 4, 5].map(BigInt)
    };

    const valueMappingStruct: { [key: string]: any } = {
      uintAddressMap: new Map(),
      uint1: 123,
      addressIntMap: new Map()
    };

    const referenceMappingStruct: { [key: string]: any } = {
      bytesAddressMap: new Map(),
      stringUintMap: new Map()
    };

    before(async () => {
      ({ contract: testReferenceStructs, storageLayout } = contracts.TestReferenceStructs);

      // Set map values for valueMappingStruct.
      const addressKey = addresses[2];
      const mappingKey = 456;
      valueMappingStruct.uintAddressMap.set(mappingKey, addresses[3]);
      valueMappingStruct.addressIntMap.set(addressKey, 789);

      // Set map values for referenceMappingStruct.
      const bytesKey = ethers.utils.hexlify(ethers.utils.randomBytes(40));
      const stringKey = 'abc';
      referenceMappingStruct.bytesAddressMap.set(bytesKey, addresses[1]);
      referenceMappingStruct.stringUintMap.set(stringKey, BigInt(123));

      const transactions = await Promise.all([
        testReferenceStructs.setFixedArrayStruct(fixedArrayStruct.int1, fixedArrayStruct.uintArray, fixedArrayStruct.addressArray),
        testReferenceStructs.setBytesStruct(bytesStruct),
        testReferenceStructs.setStringStruct(stringStruct),
        testReferenceStructs.setDynamicArrayStruct(dynamicArrayStruct),
        testReferenceStructs.setNestedStruct(nestedStruct),
        testReferenceStructs.setValueMappingStruct(mappingKey, valueMappingStruct.uintAddressMap.get(mappingKey), valueMappingStruct.uint1, addressKey, valueMappingStruct.addressIntMap.get(addressKey)),
        testReferenceStructs.setReferenceMappingStruct(bytesKey, referenceMappingStruct.bytesAddressMap.get(bytesKey), stringKey, referenceMappingStruct.stringUintMap.get(stringKey))
      ]);

      await Promise.all(transactions.map(transaction => transaction.wait()));
      blockHash = await getBlockHash();
    });

    // Get all members of a struct.
    it('get value for struct with fixed-size array members', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'fixedArrayStruct');
      expect(value).to.eql(fixedArrayStruct);
    });

    it('get value for struct with dynamically sized byte members', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'bytesStruct');
      expect(value).to.eql(bytesStruct);
    });

    it('get value for struct with string type members', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'stringStruct');
      expect(value).to.eql(stringStruct);
    });

    it('get value for struct with dynamic array members', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'dynamicArrayStruct');
      expect(value).to.eql(dynamicArrayStruct);
    });

    it('get value for nested struct with struct type members', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'nestedStruct');
      expect(value).to.eql(nestedStruct);
    });

    // Get value of a member in a struct
    it('get value of fixed-size array member in a struct', async () => {
      const member = 'uintArray';
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'fixedArrayStruct', member);
      expect(value).to.eql(fixedArrayStruct[member]);
    });

    it('get value of bytes member in a struct', async () => {
      const member = 'byteArray';
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'bytesStruct', member);
      expect(value).to.equal(bytesStruct[member]);
    });

    it('get value of string member in a struct', async () => {
      const member = 'string2';
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'stringStruct', member);
      expect(value).to.eql(stringStruct[member]);
    });

    it('get value of dynamic array member in a struct', async () => {
      const member = 'uintArray';
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'dynamicArrayStruct', member);
      expect(value).to.eql(dynamicArrayStruct[member]);
    });

    it('get value of mapping type member in a struct', async () => {
      // Get value for structs with mapping of value type keys.
      let member = 'uintAddressMap';
      let [mappingKey, expectedValue] = valueMappingStruct[member].entries().next().value;

      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'valueMappingStruct', member, mappingKey);
      expect(value).to.equal(expectedValue);

      // Get value for structs with mapping of reference type keys.
      member = 'stringUintMap';
      [mappingKey, expectedValue] = referenceMappingStruct[member].entries().next().value;

      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'referenceMappingStruct', member, mappingKey));
      expect(value).to.equal(expectedValue);
    });

    it('get value of nested struct member', async () => {
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
    let testMappingTypes: Contract, storageLayout: StorageLayout, blockHash: string;
    const addressArray = generateDummyAddresses(3);
    const [address1, address2] = addressArray;
    const addressUintMap = new Map();
    const boolIntMap = new Map([[true, 123]]);
    const intAddressMap = new Map([[123, address1]]);
    const uintBytesMap = new Map([[123, ethers.utils.hexlify(ethers.utils.randomBytes(16))]]);
    const enumIntMap = new Map([[1, 123]]);
    const stringIntMap = new Map([['abc', 123]]);

    const bytesAddressMap = new Map();
    const bytesAddressMapKey = ethers.utils.hexlify(ethers.utils.randomBytes(8));
    bytesAddressMap.set(bytesAddressMapKey, address1);

    const bytesUintMap = new Map();
    const bytesUintMapKey = ethers.utils.hexlify(ethers.utils.randomBytes(64));
    bytesUintMap.set(bytesUintMapKey, 123);

    const structMapValue: {[key: string]: any} = {
      uint1: BigInt(123),
      int1: BigInt(456),
      bool1: true,
      address1: address2
    };

    const intStructMap = new Map([[123, structMapValue]]);
    const fixedBytesStructKey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    const addressStructMapKey = address1;
    const uintFixedArrayMap = new Map([[123, addressArray]]);
    const intDynamicArrayMap = new Map([[123, [1, 2, 3, 4, 5, 6, 7, 8]]]);
    const addressBytesMap = new Map([[address1, ethers.utils.hexlify(ethers.utils.randomBytes(42))]]);

    const bytesStringMapKey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    const bytesStringMap = new Map([[bytesStringMapKey, 'Hello World.']]);

    before(async () => {
      const [signer1] = await ethers.getSigners();
      ({ contract: testMappingTypes, storageLayout } = contracts.TestBasicMapping);

      addressUintMap.set(signer1.address, 123);

      const transactions = await Promise.all([
        testMappingTypes.connect(signer1).setAddressUintMap(addressUintMap.get(signer1.address)),
        testMappingTypes.setBoolIntMap(true, boolIntMap.get(true)),
        testMappingTypes.setIntAddressMap(123, intAddressMap.get(123)),
        testMappingTypes.setUintBytesMap(123, uintBytesMap.get(123)),
        testMappingTypes.setBytesAddressMap(bytesAddressMapKey, bytesAddressMap.get(bytesAddressMapKey)),
        testMappingTypes.setEnumIntMap(1, enumIntMap.get(1)),
        testMappingTypes.setStringIntMap('abc', stringIntMap.get('abc')),
        testMappingTypes.setBytesUintMap(bytesUintMapKey, bytesUintMap.get(bytesUintMapKey)),
        testMappingTypes.setIntStructMap(123, structMapValue),
        testMappingTypes.setFixedBytesStructMap(fixedBytesStructKey, structMapValue),
        testMappingTypes.setAddressStructMap(addressStructMapKey, structMapValue),
        testMappingTypes.setUintFixedArrayMap(123, uintFixedArrayMap.get(123)),
        testMappingTypes.setIntDynamicArrayMap(123, intDynamicArrayMap.get(123)),
        testMappingTypes.setAddressBytesMap(address1, addressBytesMap.get(address1)),
        testMappingTypes.setBytesStringMap(bytesStringMapKey, bytesStringMap.get(bytesStringMapKey))
      ]);

      await Promise.all(transactions.map(transaction => transaction.wait()));
      blockHash = await getBlockHash();
    });

    // Tests for value type keys.
    it('get value for mapping with address type keys', async () => {
      const [mapKey, expectedValue] = addressUintMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'addressUintMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for mapping with boolean type keys', async () => {
      const [mapKey, expectedValue] = boolIntMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'boolIntMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for mapping with signed integer type keys', async () => {
      const [mapKey, expectedValue] = intAddressMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intAddressMap', mapKey);
      expect(value).to.equal(expectedValue);
    });

    it('get value for mapping with unsigned integer type keys', async () => {
      const [mapKey, expectedValue] = uintBytesMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'uintBytesMap', mapKey);
      expect(value).to.equal(expectedValue);
    });

    // TODO: Fix getting value for mapping with keys as fixed-size byte array
    // Zero value is returned if using fixed-sized byte array keys of length less than 32 bytes
    // Type Bytes32 works whereas types like bytes16, bytes24 do not work.
    it.skip('get value for mapping with fixed-size byte array keys', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'bytesAddressMap', bytesAddressMapKey);
      expect(value).to.equal(bytesAddressMap.get(bytesAddressMapKey));
    });

    it('get value for mapping with enum type keys', async () => {
      const [mapKey, expectedValue] = enumIntMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'enumIntMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    // Tests for reference type keys.
    it('get value for mapping with string type keys', async () => {
      const [mapKey, expectedValue] = stringIntMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'stringIntMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for mapping with dynamically-sized byte array as keys', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'bytesUintMap', bytesUintMapKey);
      expect(value).to.equal(BigInt(bytesUintMap.get(bytesUintMapKey)));
    });

    // Tests for reference type values.
    it('get value for mapping with struct type values', async () => {
      const mapKey = intStructMap.keys().next().value;
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intStructMap', mapKey);
      expect(value).to.eql(structMapValue);

      // Get value of specified struct member in mapping.
      let structMember = 'bool1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intStructMap', mapKey, structMember));
      expect(value).to.equal(structMapValue[structMember]);

      structMember = 'address1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intStructMap', mapKey, structMember));
      expect(value).to.equal(structMapValue[structMember]);
    });

    it('get value for mapping of fixed size bytes keys and struct type values', async () => {
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'fixedBytesStructMap', fixedBytesStructKey);
      expect(value).to.eql(structMapValue);

      // Get value of specified struct member in mapping.
      const structMember = 'int1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'fixedBytesStructMap', fixedBytesStructKey, structMember));
      expect(value).to.equal(structMapValue[structMember]);
    });

    it('get value for mapping of address type keys and struct type values', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'addressStructMap', addressStructMapKey);
      expect(value).to.eql(structMapValue);
    });

    it('get value for mapping of unsigned integer keys and fixed-size array values', async () => {
      const [mapKey, expectedValue] = uintFixedArrayMap.entries().next().value;
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'uintFixedArrayMap', mapKey);
      expect(value).to.eql(expectedValue);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(expectedValue.length);
    });

    it('get value for mapping of signed integer keys and dynamically-sized array values', async () => {
      const [mapKey, expectedValue] = intDynamicArrayMap.entries().next().value;
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intDynamicArrayMap', mapKey);
      expect(value).to.eql(expectedValue.map(BigInt));
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(expectedValue.length);
    });

    it('get value for mapping of address keys and dynamic byte array values', async () => {
      const [mapKey, expectedValue] = addressBytesMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'addressBytesMap', mapKey);
      expect(value).to.eql(expectedValue);
    });

    it('get value for mapping of fixed size byte array keys and string type values', async () => {
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'bytesStringMap', bytesStringMapKey);
      expect(value).to.eql(bytesStringMap.get(bytesStringMapKey));
    });
  });

  describe('nested mapping type', () => {
    let testNestedMapping: Contract, storageLayout: StorageLayout, blockHash: string;
    const [address1, address2, address3] = generateDummyAddresses(3);
    const nestedAddressUintMap = new Map();

    const intAddressBoolMap = new Map([[123, new Map()]]);
    intAddressBoolMap.get(123)?.set(address1, false);

    const uintStringIntMap = new Map([[456, new Map()]]);
    uintStringIntMap.get(456)?.set('abc', 123);

    const bytesIntAddressMapKey = ethers.utils.hexlify(ethers.utils.randomBytes(64));
    const bytesIntAddressMap = new Map([[bytesIntAddressMapKey, new Map()]]);
    bytesIntAddressMap.get(bytesIntAddressMapKey)?.set(123, address1);

    const stringAddressIntMap = new Map([['abc', new Map()]]);
    stringAddressIntMap.get('abc')?.set(address1, 123);

    const doubleNestedAddressMap = new Map([[address1, new Map()]]);
    doubleNestedAddressMap.get(address1)?.set(address2, new Map());
    doubleNestedAddressMap.get(address1)?.get(address2)?.set(123, address3);

    before(async () => {
      const [signer1] = await ethers.getSigners();
      ({ contract: testNestedMapping, storageLayout } = contracts.TestNestedMapping);

      nestedAddressUintMap.set(signer1.address, new Map());
      nestedAddressUintMap.get(signer1.address).set(address1, 123);

      const transactions = await Promise.all([
        testNestedMapping.connect(signer1).setNestedAddressUintMap(address1, nestedAddressUintMap.get(signer1.address).get(address1)),
        testNestedMapping.setIntAddressBoolMap(123, address1, intAddressBoolMap.get(123)?.get(address1)),
        testNestedMapping.setUintStringIntMap(456, 'abc', uintStringIntMap.get(456)?.get('abc')),
        testNestedMapping.setBytesIntAddressMap(bytesIntAddressMapKey, 123, bytesIntAddressMap.get(bytesIntAddressMapKey)?.get(123)),
        testNestedMapping.setStringAddressIntMap('abc', address1, stringAddressIntMap.get('abc')?.get(address1)),
        testNestedMapping.setDoubleNestedAddressMap(address1, address2, 123, doubleNestedAddressMap.get(address1)?.get(address2)?.get(123))
      ]);

      await Promise.all(transactions.map(transaction => transaction.wait()));
      blockHash = await getBlockHash();
    });

    it('get value for nested mapping with address type keys', async () => {
      const [mapKey, nestedMap] = nestedAddressUintMap.entries().next().value;
      const [nestedKey, expectedValue] = nestedMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'nestedAddressUintMap', mapKey, nestedKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for nested mapping with signed integer type keys', async () => {
      const [mapKey, nestedMap] = intAddressBoolMap.entries().next().value;
      const [nestedKey, expectedValue] = nestedMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'intAddressBoolMap', mapKey, nestedKey);
      expect(value).to.equal(expectedValue);
    });

    it('get value for nested mapping with unsigned integer type keys', async () => {
      const [mapKey, nestedMap] = uintStringIntMap.entries().next().value;
      const [nestedKey, expectedValue] = nestedMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'uintStringIntMap', mapKey, nestedKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for nested mapping with dynamically-sized byte array as keys', async () => {
      const [mapKey, nestedMap] = bytesIntAddressMap.entries().next().value;
      const [nestedKey, expectedValue] = nestedMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'bytesIntAddressMap', mapKey, nestedKey);
      expect(value).to.equal(expectedValue);
    });

    it('get value for nested mapping with string type keys', async () => {
      const [mapKey, nestedMap] = stringAddressIntMap.entries().next().value;
      const [nestedKey, expectedValue] = nestedMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'stringAddressIntMap', mapKey, nestedKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for double nested mapping with address type keys', async () => {
      const [mapKey, nestedMap] = doubleNestedAddressMap.entries().next().value;
      const [nestedKey, doubleNestedMap] = nestedMap.entries().next().value;
      const [doubleNestedKey, expectedValue] = doubleNestedMap.entries().next().value;
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'doubleNestedAddressMap', mapKey, nestedKey, doubleNestedKey);
      expect(value).to.equal(expectedValue);
    });
  });
});
