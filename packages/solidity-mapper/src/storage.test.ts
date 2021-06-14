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
    expect(value).to.equal(BigInt(expectedValue));

    expectedValue = 34;
    await integers.setInt2(expectedValue);
    blockHash = await getBlockHash();
    ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, integers.address, 'int2'));
    expect(value).to.equal(BigInt(expectedValue));
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
    expect(value).to.equal(BigInt(expectedValue));
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
    expect(value).to.equal(BigInt(expectedValue));

    expectedValue = 34;
    await unsignedIntegers.setUint2(expectedValue);
    blockHash = await getBlockHash();
    ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, unsignedIntegers.address, 'uint2'));
    expect(value).to.equal(BigInt(expectedValue));
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
    expect(value).to.equal(BigInt(expectedValue));
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

  describe('fixed size arrays', () => {
    let testFixedArrays: Contract, storageLayout: StorageLayout;
    const int128Array = [100, 200, 300, 400, 500];
    const uint16Array = [10, 20, 30, 40, 50];
    const boolArray = [true, false];
    let addressArray: string[] = [];

    before(async () => {
      const TestFixedArrays = await ethers.getContractFactory('TestFixedArrays');
      testFixedArrays = await TestFixedArrays.deploy();
      await testFixedArrays.deployed();
      storageLayout = await getStorageLayout('TestFixedArrays');

      const signers = await ethers.getSigners();
      addressArray = signers.map(signer => signer.address.toLowerCase())
        .slice(0, 4);
    });

    // Get all elements of array.
    // Test for array variables which are 32 bytes or less and packed into a single slot.
    it('get value for fixed size arrays using single slot', async () => {
      await testFixedArrays.setBoolArray(boolArray);
      let blockHash = await getBlockHash();
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'boolArray');
      expect(value).to.eql(boolArray);
      let proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(boolArray.length);

      await testFixedArrays.setUint16Array(uint16Array);
      blockHash = await getBlockHash();
      ({ value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'uint16Array'));
      expect(value).to.eql(uint16Array.map(el => BigInt(el)));
      proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(uint16Array.length);
    });

    // Test for array variables which are more than 32 bytes and use multiple slots.
    it('get value for fixed size arrays using multiple slots', async () => {
      await testFixedArrays.setInt128Array(int128Array);
      let blockHash = await getBlockHash();
      let { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'int128Array');
      expect(value).to.eql(int128Array.map(el => BigInt(el)));
      let proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(int128Array.length);

      await testFixedArrays.setUintArray(uint16Array);
      blockHash = await getBlockHash();
      ({ value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'uintArray'));
      expect(value).to.eql(uint16Array.map(el => BigInt(el)));
      proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(uint16Array.length);
    });

    it('get value for fixed size arrays of address type', async () => {
      await testFixedArrays.setAddressArray(addressArray);
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'addressArray');
      expect(value).to.eql(addressArray);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(addressArray.length);
    });

    it.skip('get value for fixed size arrays of fixed size bytes type', async () => {
      const expectedValue = Array.from({ length: 5 }, () => ethers.utils.hexlify(ethers.utils.randomBytes(10)));

      await testFixedArrays.setBytesArray(expectedValue);
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'bytesArray');
      expect(value).to.eql(expectedValue);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(expectedValue.length);
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
        await testFixedArrays.setStructArray(structElement, i);
      }

      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'structArray');
      expect(value).to.eql(expectedValue);
      const proofData = JSON.parse(proof.data);
      expect(proofData.length).to.equal(expectedValue.length);
    });

    // Get element of array by index.
    it('get value of signed integer type array by index', async () => {
      const arrayIndex = 2;
      await testFixedArrays.setInt128Array(int128Array);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'int128Array', arrayIndex);
      expect(value).to.equal(BigInt(int128Array[arrayIndex]));
    });

    it('get value of unsigned integer type array by index', async () => {
      const arrayIndex = 3;
      await testFixedArrays.setUint16Array(uint16Array);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'uint16Array', arrayIndex);
      expect(value).to.equal(BigInt(uint16Array[arrayIndex]));
    });

    it('get value of boolean type array by index', async () => {
      const arrayIndex = 0;
      await testFixedArrays.setBoolArray(boolArray);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'boolArray', arrayIndex);
      expect(value).to.equal(boolArray[arrayIndex]);
    });

    it('get value of address type array by index', async () => {
      const arrayIndex = 1;
      await testFixedArrays.setAddressArray(addressArray);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'addressArray', arrayIndex);
      expect(value).to.equal(addressArray[arrayIndex]);
    });

    it('get value of struct type array by index', async () => {
      const expectedValue = {
        int1: BigInt(123),
        uint1: BigInt(456),
        bool1: false
      };

      const arrayIndex = 2;
      await testFixedArrays.setStructArray(expectedValue, arrayIndex);
      const blockHash = await getBlockHash();
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'structArray', arrayIndex);
      expect(value).to.eql(expectedValue);

      // Get value of specified struct member in array element.
      const structMember = 'uint1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testFixedArrays.address, 'structArray', arrayIndex, structMember));
      expect(value).to.eql(expectedValue[structMember]);
    });
  });

  describe('structs with value type members', () => {
    let testValueStructs: Contract, storageLayout: StorageLayout;
    /* eslint-disable @typescript-eslint/no-explicit-any */
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

      const [signer1, signer2] = await ethers.getSigners();

      addressStruct = {
        int1: BigInt(123),
        address1: signer1.address.toLowerCase(),
        address2: signer2.address.toLowerCase(),
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
      await testValueStructs.setSingleSlotStruct(singleSlotStruct.int1, singleSlotStruct.uint1);
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'singleSlotStruct');
      expect(value).to.eql(singleSlotStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys('int1', 'uint1');
    });

    it('get value for struct using multiple slots', async () => {
      await testValueStructs.setMultipleSlotStruct(multipleSlotStruct.uint1, multipleSlotStruct.bool1, multipleSlotStruct.int1);
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'multipleSlotStruct');
      expect(value).to.eql(multipleSlotStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys(Object.keys(multipleSlotStruct));
    });

    it('get value for struct with address type members', async () => {
      await testValueStructs.setAddressStruct(addressStruct);
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'addressStruct');
      expect(value).to.eql(addressStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys(Object.keys(addressStruct));
    });

    it('get value for struct with contract type members', async () => {
      await testValueStructs.setContractStruct(contractStruct.uint1, contractStruct.testContract);
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'contractStruct');
      expect(value).to.eql(contractStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys(Object.keys(contractStruct));
    });

    it('get value for struct with fixed-sized byte array members', async () => {
      await testValueStructs.setFixedBytesStruct(fixedBytesStruct.uint1, fixedBytesStruct.bytesTen, fixedBytesStruct.bytesTwenty);
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'fixedBytesStruct');
      expect(value).to.eql(fixedBytesStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys('uint1', 'bytesTen', 'bytesTwenty');
    });

    it('get value for struct with enum type members', async () => {
      await testValueStructs.setEnumStruct(enumStruct.uint1, enumStruct.choice1, enumStruct.choice2);
      const blockHash = await getBlockHash();
      const { value, proof } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'enumStruct');
      expect(value).to.eql(enumStruct);
      const proofData = JSON.parse(proof.data);
      expect(proofData).to.have.all.keys('uint1', 'choice1', 'choice2');
    });

    // Get value of a member in a struct
    it('get value of signed integer type member in a struct', async () => {
      const member = 'int1';
      await testValueStructs.setSingleSlotStruct(singleSlotStruct.int1, singleSlotStruct.uint1);
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
      await testValueStructs.setMultipleSlotStruct(multipleSlotStruct.uint1, multipleSlotStruct.bool1, multipleSlotStruct.int1);
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
      await testValueStructs.setAddressStruct(addressStruct);
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
      await testValueStructs.setContractStruct(contractStruct.uint1, contractStruct.testContract);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'contractStruct', member);
      expect(value).to.equal(contractStruct[member]);
    });

    it('get value of fixed byte array member in a struct', async () => {
      const member = 'bytesTen';
      await testValueStructs.setFixedBytesStruct(fixedBytesStruct.uint1, fixedBytesStruct.bytesTen, fixedBytesStruct.bytesTwenty);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'fixedBytesStruct', member);
      expect(value).to.equal(fixedBytesStruct[member]);
    });

    it('get value of enum type member in a struct', async () => {
      const member = 'choice2';
      await testValueStructs.setEnumStruct(enumStruct.uint1, enumStruct.choice1, enumStruct.choice2);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testValueStructs.address, 'enumStruct', member);
      expect(value).to.equal(enumStruct[member]);
    });
  });

  describe('structs with reference type members', () => {
    let testReferenceStructs: Contract, storageLayout: StorageLayout;
    let fixedArrayStruct: {[key: string]: any};

    const stringStruct = {
      string1: 'string1',
      uint1: BigInt(123),
      string2: 'string2'
    };

    before(async () => {
      const TestReferenceStructs = await ethers.getContractFactory('TestReferenceStructs');
      testReferenceStructs = await TestReferenceStructs.deploy();
      await testReferenceStructs.deployed();
      storageLayout = await getStorageLayout('TestReferenceStructs');

      const signers = await ethers.getSigners();

      fixedArrayStruct = {
        int1: BigInt(123),
        uintArray: [1, 2, 3, 4].map(el => BigInt(el)),
        addressArray: signers.slice(0, 3).map(signer => signer.address.toLowerCase())
      };
    });

    // Get all members of a struct.
    it('get value for struct with fixed-size array members', async () => {
      await testReferenceStructs.setFixedArrayStruct(fixedArrayStruct.int1, fixedArrayStruct.uintArray, fixedArrayStruct.addressArray);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'fixedArrayStruct');
      expect(value).to.eql(fixedArrayStruct);
    });

    it('get value for struct with string type members', async () => {
      await testReferenceStructs.setStringStruct(stringStruct.string1, stringStruct.uint1, stringStruct.string2);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'stringStruct');
      expect(value).to.eql(stringStruct);
    });

    // Get value of a member in a struct
    it('get value of fixed-size array member in a struct', async () => {
      const member = 'uintArray';
      await testReferenceStructs.setFixedArrayStruct(fixedArrayStruct.int1, fixedArrayStruct.uintArray, fixedArrayStruct.addressArray);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'fixedArrayStruct', member);
      expect(value).to.eql(fixedArrayStruct[member]);
    });

    it('get value of string member in a struct', async () => {
      const member = 'string2';
      await testReferenceStructs.setStringStruct(stringStruct.string1, stringStruct.uint1, stringStruct.string2);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'stringStruct', member);
      expect(value).to.eql(stringStruct[member]);
    });

    it.skip('get value of mapping type member in a struct', async () => {
      const [signer1, signer2] = await ethers.getSigners();

      const valueMappingStruct: { [key: string]: any } = {
        uintAddressMap: new Map(),
        uint1: 123,
        addressIntMap: new Map()
      };

      const mappingKey = 456;
      valueMappingStruct.uintAddressMap.set(mappingKey, signer1.address.toLowerCase());
      valueMappingStruct.addressIntMap.set(signer2.address, 789);
      let member = 'uintAddressMap';

      await testReferenceStructs.setValueMappingStruct(mappingKey, valueMappingStruct.uintAddressMap.get(mappingKey), valueMappingStruct.uint1, signer2.address, valueMappingStruct.addressIntMap.get(signer2.address));
      let blockHash = await getBlockHash();
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'valueMappingStruct', member, mappingKey);
      expect(value).to.equal(valueMappingStruct[member].get(mappingKey));

      const referenceMappingStruct: { [key: string]: any } = {
        bytesAddressMap: new Map(),
        stringUintMap: new Map()
      };

      const bytesKey = ethers.utils.hexlify(ethers.utils.randomBytes(40));
      const stringKey = 'abc';
      referenceMappingStruct.bytesAddressMap.set(bytesKey, signer1.address.toLowerCase());
      referenceMappingStruct.stringUintMap.set(stringKey, 123);
      member = 'stringAddressMap';

      await testReferenceStructs.setReferenceMappingStruct(bytesKey, referenceMappingStruct.bytesAddressMap.get(bytesKey), stringKey, referenceMappingStruct.stringUintMap.get(stringKey));
      blockHash = await getBlockHash();
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testReferenceStructs.address, 'referenceMappingStruct', member, stringKey));
      expect(value).to.equal(referenceMappingStruct[member].get(stringKey));
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
      const [, signer1] = await ethers.getSigners();
      await testMappingTypes.connect(signer1).setAddressUintMap(expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'addressUintMap', signer1.address);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for mapping with boolean type keys', async () => {
      const expectedValue = 123;
      const mapKey = true;
      await testMappingTypes.setBoolIntMap(mapKey, expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'boolIntMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for mapping with signed integer type keys', async () => {
      const mapKey = 123;
      const [, signer1] = await ethers.getSigners();
      await testMappingTypes.setIntAddressMap(mapKey, signer1.address);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intAddressMap', mapKey);
      expect(value).to.equal(signer1.address.toLowerCase());
    });

    it('get value for mapping with unsigned integer type keys', async () => {
      const expectedValue = ethers.utils.hexlify(ethers.utils.randomBytes(16));
      const mapKey = 123;
      await testMappingTypes.setUintBytesMap(mapKey, expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'uintBytesMap', mapKey);
      expect(value).to.equal(expectedValue);
    });

    it.skip('get value for mapping with fixed-size byte array keys', async () => {
      const mapKey = ethers.utils.hexlify(ethers.utils.randomBytes(8));
      const [, signer1] = await ethers.getSigners();
      await testMappingTypes.setBytesAddressMap(mapKey, signer1.address);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'bytesAddressMap', mapKey);
      expect(value).to.equal(signer1.address);
    });

    it('get value for mapping with enum type keys', async () => {
      const mapKey = 1;
      const expectedValue = 123;
      await testMappingTypes.setEnumIntMap(mapKey, expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'enumIntMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    // Tests for reference type keys.
    it('get value for mapping with string type keys', async () => {
      const mapKey = 'abc';
      const expectedValue = 123;
      await testMappingTypes.setStringIntMap(mapKey, expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'stringIntMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for mapping with dynamically-sized byte array as keys', async () => {
      const mapKey = ethers.utils.hexlify(ethers.utils.randomBytes(64));
      const expectedValue = 123;
      await testMappingTypes.setBytesUintMap(mapKey, expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'bytesUintMap', mapKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    // Tests for reference type values.
    it('get value for mapping with struct type values', async () => {
      const expectedValue = {
        uint1: BigInt(123),
        int1: BigInt(456),
        bool1: true
      };

      const mapKey = 123;
      await testMappingTypes.setIntStructMap(mapKey, expectedValue);
      const blockHash = await getBlockHash();
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intStructMap', mapKey);
      expect(value).to.eql(expectedValue);

      // Get value of specified struct member in mapping.
      const structMember = 'bool1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'intStructMap', mapKey, structMember));
      expect(value).to.equal(expectedValue[structMember]);
    });

    it('get value for mapping of fixed size bytes keys and struct type values', async () => {
      const expectedValue = {
        uint1: BigInt(123),
        int1: BigInt(456),
        bool1: true
      };

      const mapKey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      await testMappingTypes.setFixedBytesStructMap(mapKey, expectedValue);
      const blockHash = await getBlockHash();
      let { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'fixedBytesStructMap', mapKey);
      expect(value).to.eql(expectedValue);

      // Get value of specified struct member in mapping.
      const structMember = 'int1';
      ({ value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testMappingTypes.address, 'fixedBytesStructMap', mapKey, structMember));
      expect(value).to.equal(expectedValue[structMember]);
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
      const [, signer1, signer2] = await ethers.getSigners();
      await testNestedMapping.connect(signer1).setNestedAddressUintMap(signer2.address, expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'nestedAddressUintMap', signer1.address, signer2.address);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for nested mapping with signed integer type keys', async () => {
      const expectedValue = false;
      const key = 123;
      const [, signer1] = await ethers.getSigners();
      await testNestedMapping.setIntAddressBoolMap(key, signer1.address, expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'intAddressBoolMap', key, signer1.address);
      expect(value).to.equal(expectedValue);
    });

    it('get value for nested mapping with unsigned integer type keys', async () => {
      const expectedValue = 123;
      const key = 456;
      const nestedKey = 'abc';
      await testNestedMapping.setUintStringIntMap(key, nestedKey, expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'uintStringIntMap', key, nestedKey);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for nested mapping with dynamically-sized byte array as keys', async () => {
      const key = ethers.utils.hexlify(ethers.utils.randomBytes(64));
      const nestedKey = 123;
      const [, signer1] = await ethers.getSigners();
      await testNestedMapping.setBytesIntAddressMap(key, nestedKey, signer1.address);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'bytesIntAddressMap', key, nestedKey);
      expect(value).to.equal(signer1.address.toLowerCase());
    });

    it('get value for nested mapping with string type keys', async () => {
      const key = 'abc';
      const expectedValue = 123;
      const [, signer1] = await ethers.getSigners();
      await testNestedMapping.setStringAddressIntMap(key, signer1.address, expectedValue);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'stringAddressIntMap', key, signer1.address);
      expect(value).to.equal(BigInt(expectedValue));
    });

    it('get value for double nested mapping with address type keys', async () => {
      const [signer1, signer2, signer3] = await ethers.getSigners();
      const uintKey = 123;
      await testNestedMapping.setDoubleNestedAddressMap(signer1.address, signer2.address, uintKey, signer3.address);
      const blockHash = await getBlockHash();
      const { value } = await getStorageValue(storageLayout, getStorageAt, blockHash, testNestedMapping.address, 'doubleNestedAddressMap', signer1.address, signer2.address, uintKey);
      expect(value).to.equal(signer3.address.toLowerCase());
    });
  });
});
