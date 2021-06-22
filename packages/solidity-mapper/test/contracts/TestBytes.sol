// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestBytes {
    // Byte array variables are packed together in a slot as they occupy less than 32 bytes together.
    bytes10 bytesTen;
    bytes20 bytesTwenty;

    // Byte array variable is stored in the next slot as there is not enough space for it in the previous slot.
    bytes30 bytesThirty;

    // Dynamically sized byte arrays will take the next single slot.
    // If data is 32 or more bytes, the main slot stores the value length * 2 + 1 and the data is stored in keccak256(slot).
    // Else the main slot stores the data and value length * 2.
    // https://docs.soliditylang.org/en/v0.7.4/internals/layout_in_storage.html#bytes-and-string
    bytes bytesArray1;
    bytes bytesArray2;

    // Set variable bytesTen.
    function setBytesTen(bytes10 value) external {
        bytesTen = value;
    }

    // Set variable bytesTwenty.
    function setBytesTwenty(bytes20 value) external {
        bytesTwenty = value;
    }

    // Set variable bytesThirty.
    function setBytesThirty(bytes30 value) external {
        bytesThirty = value;
    }

    // Set variable bytesArray1.
    function setBytesArray1(bytes calldata value) external {
        bytesArray1 = value;
    }

    // Set variable bytesArray2.
    function setBytesArray2(bytes calldata value) external {
        bytesArray2 = value;
    }
}
