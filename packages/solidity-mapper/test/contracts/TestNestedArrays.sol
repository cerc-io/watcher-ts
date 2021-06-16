// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

// https://docs.soliditylang.org/en/v0.8.5/layout-of-source-files.html#abi-coder-pragma
pragma abicoder v2;

contract TestNestedArrays {
    struct TestStruct {
        uint256 uint1;
        address address1;
    }

    TestStruct[3][5] nestedStructArray;

    // Set variable nestedStructArray.
    function setNestedStructArray(uint index, uint nestedIndex, TestStruct calldata value) external {
        nestedStructArray[index][nestedIndex] = value;
    }
}
