// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.0;

contract TestStrings {
    string string1;

    // String type variable takes the next single slot.
    // If data is 32 or more bytes, the main slot stores the value length * 2 + 1 and the data is stored in keccak256(slot).
    // Else the main slot stores the data and value length * 2.
    // https://docs.soliditylang.org/en/v0.7.4/internals/layout_in_storage.html#bytes-and-string
    string string2;

    // Set variable string1.
    function setString1(string memory value) external {
        string1 = value;
    }

    // Set variable string2.
    function setString2(string memory value) external {
        string2 = value;
    }
}
