// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestFixedArrays {
    // Fixed size array variable will use 5 consecutive slots as size of 1 element is 32 bytes.
    uint[5] uintArray;

    // Fixed size array variable will use 10 consecutive slots as size of 1 element is 32 bytes.
    int[10] intArray;

    // Fixed size array variable will use 1 slot as size of one element is 1 byte.
    int8[2] int8Array;

    // Fixed size array variable will use the next consecutive slot as it is of array type.
    // https://docs.soliditylang.org/en/v0.7.4/internals/layout_in_storage.html#layout-of-state-variables-in-storage
    uint128[5] uint128Array;

    // Set varaible uintArray.
    function setUintArray(uint[5] calldata value) external {
        uintArray = value;
    }

    // Set varaible int8Array.
    function setInt8Array(int8[2] calldata value) external {
        int8Array = value;
    }

    // Set varaible uint128Array.
    function setUint128Array(uint128[5] calldata value) external {
        uint128Array = value;
    }
}
