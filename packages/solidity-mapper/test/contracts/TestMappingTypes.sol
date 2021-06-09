// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestMappingTypes {
    // Mapping type variable occupies one single slot but the actual elements are stored at a different storage slot that is computed using a Keccak-256 hash.
    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#mappings-and-dynamic-arrays
    mapping (address => mapping (address => uint)) private nestedAddressUintMap;

    // Mapping type variable occupies the next single slot.
    mapping(address => uint) public addressUintMap;

    // Set variable addressUintMap.
    function setAddressUintMap(uint value) external {
        addressUintMap[msg.sender] = value;
    }

    // Set variable nestedAddressUintMap.
    function setNestedAddressUintMap(address addressValue, uint uintValue) external {
        nestedAddressUintMap[msg.sender][addressValue] = uintValue;
    }
}
