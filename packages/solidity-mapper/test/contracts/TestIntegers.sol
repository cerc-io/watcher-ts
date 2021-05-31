// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestIntegers {
    // Following variables are packed together in a single slot since the combined size is less than 32 bytes.
    int8 int1;
    int16 int2;

    // Variable is stored in the next slot as it needs 32 bytes of storage.
    int256 int3;

    // Variable is stored in the next slot as there is not enough space for it in the previous slot.
    int32 int4;

    // Set variable int1.
    function setInt1(int8 value) external {
        int1 = value;
    }

    // Set variable int2.
    function setInt2(int16 value) external {
        int2 = value;
    }

    // Set variable int3.
    function setInt3(int256 value) external {
        int3 = value;
    }

    // Set variable int4.
    function setInt4(int32 value) external {
        int4 = value;
    }
}
