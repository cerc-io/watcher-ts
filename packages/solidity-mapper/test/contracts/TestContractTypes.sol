// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./TestAddress.sol";

contract TestContractTypes {
    // Contract types like address type need 20 bytes for storage.
    TestAddress addressContract1;

    // Contract type variable uses the next slot as there is not enough space in previous slot.
    TestAddress addressContract2;

    // Set variable addressContract1.
    function setAddressContract1 (TestAddress value) external {
        addressContract1 = value;
    }

    // Set variable addressContract2.
    function setAddressContract2 (TestAddress value) external {
        addressContract2 = value;
    }
}
