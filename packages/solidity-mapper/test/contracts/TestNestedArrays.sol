// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.6;

// https://docs.soliditylang.org/en/v0.8.5/layout-of-source-files.html#abi-coder-pragma
pragma abicoder v2;

contract TestNestedArrays {
    address[4][3] nestedAddressArray;

    struct TestStruct {
        uint256 uint1;
        address address1;
    }

    TestStruct[3][5] nestedStructArray;

    int128[3][] nestedFixedDynamicArray;

    uint32[][4] nestedDynamicFixedArray;

    int64[][] nestedDynamicArray;

    // Set variable nestedStructArray.
    function setNestedStructArray(uint index, uint nestedIndex, TestStruct calldata value) external {
        nestedStructArray[index][nestedIndex] = value;
    }

    // Set variable nestedAddressArray.
    function setNestedAddressArray(address[4][3] calldata value) external {
        nestedAddressArray = value;
    }

    // Set variable nestedFixedDynamicArray.
    function setNestedFixedDynamicArray(int128[3][] calldata value) external {
        nestedFixedDynamicArray = value;
    }

    // Set variable nestedDynamicFixedArray.
    function setNestedDynamicFixedArray(uint32[][4] memory value) external {
        nestedDynamicFixedArray = value;
    }

    // Set variable nestedDynamicArray.
    function setNestedDynamicArray(int64[][] memory value) external {
        nestedDynamicArray = value;
    }
}
