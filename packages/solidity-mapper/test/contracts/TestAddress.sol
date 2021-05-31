// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestAddress {
    address address1;

    address payable address2;

    // Set variable address1.
    function setAddress1(address value) external {
        address1 = value;
    }

    // Set variable address2.
    function setAddress2(address payable value) external {
        address2 = value;
    }
}
