// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.0;

contract TestNestedMapping {
    // Mapping type variable occupies one single slot but the actual elements are stored at a different storage slot that is computed using a Keccak-256 hash.
    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#mappings-and-dynamic-arrays
    mapping (address => mapping (address => uint)) private nestedAddressUintMap;

    mapping (int => mapping (address => bool)) private intAddressBoolMap;

    mapping (uint => mapping (string => int)) private uintStringIntMap;

    mapping (bytes => mapping (int => address)) private bytesIntAddressMap;

    mapping (string => mapping (address => int)) private stringAddressIntMap;

    mapping (address => mapping (address => mapping (uint24 => address))) public doubleNestedAddressMap;

    // Set variable nestedAddressUintMap.
    function setNestedAddressUintMap(address nestedKey, uint value) external {
        nestedAddressUintMap[msg.sender][nestedKey] = value;
    }

    // Set variable intAddressBoolMap.
    function setIntAddressBoolMap(int key, address nestedKey, bool value) external {
        intAddressBoolMap[key][nestedKey] = value;
    }

    // Set variable uintStringIntMap.
    function setUintStringIntMap(uint key, string calldata nestedKey, int value) external {
        uintStringIntMap[key][nestedKey] = value;
    }

    // Set variable bytesIntAddressMap.
    function setBytesIntAddressMap(bytes calldata key, int nestedKey, address value) external {
        bytesIntAddressMap[key][nestedKey] = value;
    }

    // Set variable stringAddressIntMap.
    function setStringAddressIntMap(string calldata key, address nestedKey, int value) external {
        stringAddressIntMap[key][nestedKey] = value;
    }

    // Set variable doubleNestedAddressMap.
    function setDoubleNestedAddressMap(address key, address nestedKey, uint24 doubleNestedKey, address value) external {
        doubleNestedAddressMap[key][nestedKey][doubleNestedKey] = value;
    }
}
