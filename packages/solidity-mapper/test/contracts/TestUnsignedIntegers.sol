// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestUnsignedIntegers {
    // Following variables are packed together in a single slot since the combined size is less than 32 bytes.
    uint8 uint1;
    uint16 uint2;

    // Variable is stored in the next slot as it needs 32 bytes of storage.
    uint256 uint3;

    // Variable is stored in the next slot as there is not enough space for it in the previous slot.
    uint32 uint4;

    // Set variable uint1.
    function setUint1(uint8 value) external {
        uint1 = value;
    }

    // Set variable uint2.
    function setUint2(uint16 value) external {
        uint2 = value;
    }

    // Set variable uint3.
    function setUint3(uint256 value) external {
        uint3 = value;
    }

    // Set variable uint4.
    function setUint4(uint32 value) external {
        uint4 = value;
    }
}
