// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

contract TestDynamicArrays {
    // Dynamic sized array variable will use 1 single slot which contains number of array elements.
    int[] intArray;

    // Dynamic sized array always uses the next consecutive single slot.
    uint128[] uintArray;

    bool[] boolArray;

    address[] addressArray;

    bytes10[] fixedBytesArray;

    enum Choices { Choice0, Choice1, Choice2, Choice3 }

    Choices[] enumArray;

    bytes[] bytesArray;

    string[] stringArray;

    struct TestStruct {
        uint32 uint1;
        int56 int1;
        bool bool1;
    }

    TestStruct[] structArray;

    mapping(address => uint)[] mapArray;

    // Set variable intArray.
    function setIntArray(int[] calldata value) external {
        intArray = value;
    }

    // Set variable uintArray.
    function setUintArray(uint128[] calldata value) external {
        uintArray = value;
    }

    // Set variable boolArray.
    function setBoolArray(bool[] calldata value) external {
        boolArray = value;
    }

    // Set variable addressArray.
    function setAddressArray(address[] calldata value) external {
        addressArray = value;
    }

    // Set variable fixedBytesArray.
    function setFixedBytesArray(bytes10[] calldata value) external {
        fixedBytesArray = value;
    }

    // Set variable enumArray.
    function setEnumArray(Choices[] calldata value) external {
        enumArray = value;
    }

    // Set variable bytesArray.
    function setBytesArray(bytes[] memory value) external {
        bytesArray = value;
    }

    // Set variable stringArray.
    function setStringArray(string[] memory value) external {
        stringArray = value;
    }

    // Set variable structArray.
    function addStructArrayElement(TestStruct calldata value) external {
        structArray.push(value);
    }

    // Set variable structArray.
    function addMapArrayElement(address key, uint value) external {
        mapping(address => uint256) storage element = mapArray.push();
        element[key] = value;
    }
}
