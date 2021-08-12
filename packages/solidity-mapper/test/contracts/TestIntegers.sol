// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.0;

contract TestIntegers {
    // Following integer type variables are packed together in a single slot since the combined size is less than 32 bytes.
    int8 int1;
    int16 int2;

    // Integer type variable is stored in the next slot as it needs 32 bytes of storage.
    int256 int3;

    // Integer type variable is stored in the next slot as there is not enough space for it in the previous slot.
    int24 int4;

    int32 int5;
    int64 int6;
    int72 int7;
    int96 int9;
    int128 int10;
    int200 int11;
    int232 int12;
    int256 int13;

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
    function setInt4(int24 value) external {
        int4 = value;
    }

    // Set variable int5.
    function setInt5(int32 value) external {
        int5 = value;
    }

    // Set variable int6.
    function setInt6(int64 value) external {
        int6 = value;
    }

    // Set variable int7.
    function setInt7(int72 value) external {
        int7 = value;
    }

    // Set variable int9.
    function setInt9(int96 value) external {
        int9 = value;
    }

    // Set variable int10.
    function setInt10(int128 value) external {
        int10 = value;
    }

    // Set variable int11.
    function setInt11(int200 value) external {
        int11 = value;
    }

    // Set variable int12.
    function setInt12(int232 value) external {
        int12 = value;
    }

    // Set variable int13.
    function setInt13(int256 value) external {
        int13 = value;
    }
}
