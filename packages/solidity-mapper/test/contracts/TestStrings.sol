// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestStrings {
    string string1;

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
