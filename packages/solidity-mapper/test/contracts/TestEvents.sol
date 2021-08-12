// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.0;

contract TestEvents {
    event Event1(address address1, string string1, string strin2);

    // Function to emit event.
    function emitEvent(string calldata string1, string calldata string2) external {
        emit Event1(msg.sender, string1, string2);
    }
}
