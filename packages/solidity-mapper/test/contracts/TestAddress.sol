// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.0;

contract TestAddress {
    // Address type need 20 bytes for storage.
    address address1;

    // Address type uses the next slot as there is not enough space in previous slot.
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
