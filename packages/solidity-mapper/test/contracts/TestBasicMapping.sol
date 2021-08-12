// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.6;

// https://docs.soliditylang.org/en/v0.8.5/layout-of-source-files.html#abi-coder-pragma
pragma abicoder v2;

contract TestBasicMapping {
    // Mapping type variable occupies one single slot but the actual elements are stored at a different storage slot that is computed using a Keccak-256 hash.
    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#mappings-and-dynamic-arrays
    mapping(address => uint) public addressUintMap;

    // Mapping type variable occupies the next single slot.
    mapping(bool => int) public boolIntMap;

    // Mapping with int128 keys and contract type values.
    mapping(int128 => address) public intAddressMap;

    // Mapping with uint32 keys and fixed-size byte array values.
    mapping(uint32 => bytes16) public uintBytesMap;

    // Mapping with fixed-size byte array keys and address type values.
    mapping(bytes8 => address) public bytesAddressMap;

    // Enum declaration.
    enum Choices { Choice0, Choice1, Choice2, Choice3 }

    // Mapping with enum type keys and integer type values.
    mapping(Choices => int) public enumIntMap;

    // Mapping with string type keys and integer type values.
    mapping(string => int) public stringIntMap;

    // Mapping with dynamically-sized byte array as keys and unsigned integer type values.
    mapping(bytes => uint) public bytesUintMap;

    struct TestStruct {
        uint128 uint1;
        int56 int1;
        bool bool1;
        address address1;
    }

    // Mapping with signed integer as keys and struct type values.
    mapping(int24 => TestStruct) public intStructMap;

    // Mapping with signed integer as keys and struct type values.
    mapping(bytes32 => TestStruct) public fixedBytesStructMap;

    // Mapping with address as keys and struct type values.
    mapping(address => TestStruct) public addressStructMap;

    mapping(uint24 => address[3]) public uintFixedArrayMap;

    mapping(int16 => uint128[]) public intDynamicArrayMap;

    mapping(address => bytes) public addressBytesMap;

    mapping(bytes32 => string) public bytesStringMap;

    // Set variable addressUintMap.
    function setAddressUintMap(uint value) external {
        addressUintMap[msg.sender] = value;
    }

    // Set variable boolIntMap.
    function setBoolIntMap(bool key, int value) external {
        boolIntMap[key] = value;
    }

    // Set variable intAddressMap.
    function setIntAddressMap(int128 key, address value) external {
        intAddressMap[key] = value;
    }

    // Set variable uintBytesMap.
    function setUintBytesMap(uint32 key, bytes16 value) external {
        uintBytesMap[key] = value;
    }

    // Set variable bytesAddressMap.
    function setBytesAddressMap(bytes8 key, address value) external {
        bytesAddressMap[key] = value;
    }

    // Set variable enumIntMap.
    function setEnumIntMap(Choices key, int value) external {
        enumIntMap[key] = value;
    }

    // Set variable stringIntMap.
    function setStringIntMap(string calldata key, int value) external {
        stringIntMap[key] = value;
    }

    // Set variable bytesUintMap.
    function setBytesUintMap(bytes calldata key, uint value) external {
        bytesUintMap[key] = value;
    }

    // Set variable intStruct.
    function setIntStructMap(int24 key, TestStruct calldata value) external {
        intStructMap[key] = value;
    }

    // Set variable fixedBytesStructMap.
    function setFixedBytesStructMap(bytes32 key, TestStruct calldata value) external {
        fixedBytesStructMap[key] = value;
    }

    // Set variable fixedBytesStructMap.
    function setAddressStructMap(address key, TestStruct calldata value) external {
        addressStructMap[key] = value;
    }

    // Set variable uintFixedArrayMap.
    function setUintFixedArrayMap(uint24 key, address[3] calldata value) external {
        uintFixedArrayMap[key] = value;
    }

    // Set variable intDynamicArrayMap.
    function setIntDynamicArrayMap(int16 key, uint128[] calldata value) external {
        intDynamicArrayMap[key] = value;
    }

    // Set variable addressBytesMap.
    function setAddressBytesMap(address key, bytes calldata value) external {
        addressBytesMap[key] = value;
    }

    // Set variable bytesStringMap.
    function setBytesStringMap(bytes32 key, string calldata value) external {
        bytesStringMap[key] = value;
    }
}
