// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
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
