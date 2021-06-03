// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestFixedArrays {
    // Fixed size array variable will use 5 consecutive slots as size of 1 element is 32 bytes.
    uint[5] uintArray;

    // Fixed size array variable will use 3 slots as size of 1 element is 16 bytes.
    int128[5] int128Array;

    // Fixed size array variable will use 1 slot as size of one element is 1 byte.
    bool[2] boolArray;

    // Fixed size array variable will use the next slot as it is of array type.
    // https://docs.soliditylang.org/en/v0.7.4/internals/layout_in_storage.html#layout-of-state-variables-in-storage
    uint16[5] uint16Array;

    // Set varaible boolArray.
    function setBoolArray(bool[2] calldata value) external {
        boolArray = value;
    }

    // Set varaible uintArray.
    function setUintArray(uint[5] calldata value) external {
        uintArray = value;
    }

    // Set varaible uint16Array.
    function setUint16Array(uint16[5] calldata value) external {
        uint16Array = value;
    }

    // Set varaible uint128Array.
    function setInt128Array(int128[5] calldata value) external {
        int128Array = value;
    }
}
