// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.6;

// https://docs.soliditylang.org/en/v0.8.5/layout-of-source-files.html#abi-coder-pragma
pragma abicoder v2;

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

    address[4] addressArray;

    bytes10[5] fixedBytesArray;

    enum Choices { Choice0, Choice1, Choice2, Choice3 }

    Choices[6] enumArray;

    bytes[4] bytesArray;

    string[3] stringArray;

    struct TestStruct {
        uint32 uint1;
        int56 int1;
        bool bool1;
    }

    TestStruct[5] structArray;

    mapping(address => uint)[3] mapArray;

    // Set variable boolArray.
    function setBoolArray(bool[2] calldata value) external {
        boolArray = value;
    }

    // Set variable uintArray.
    function setUintArray(uint[5] calldata value) external {
        uintArray = value;
    }

    // Set variable uint16Array.
    function setUint16Array(uint16[5] calldata value) external {
        uint16Array = value;
    }

    // Set variable int128Array.
    function setInt128Array(int128[5] calldata value) external {
        int128Array = value;
    }

    // Set variable addressArray.
    function setAddressArray(address[4] calldata value) external {
        addressArray = value;
    }

    // Set variable fixedBytesArray.
    function setFixedBytesArray(bytes10[5] calldata value) external {
        fixedBytesArray = value;
    }

    // Set variable structArray.
    function setStructArray(TestStruct calldata value, uint index) external {
        structArray[index] = value;
    }

    // Set variable enumArray.
    function setEnumArray(Choices[6] calldata value) external {
        enumArray = value;
    }

    // Set variable bytesArray.
    function setBytesArray(bytes[4] memory value) external {
        bytesArray = value;
    }

    // Set variable stringArray.
    function setStringArray(string[3] memory value) external {
        stringArray = value;
    }

    // Set variable mapArray.
    function setMapArray(address key, uint value, uint index) external {
        mapArray[index][key] = value;
    }
}
