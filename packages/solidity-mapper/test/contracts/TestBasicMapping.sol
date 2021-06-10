// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

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
}
