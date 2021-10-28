// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

contract Example {
    uint256 private _test;

    event Test(string param1, uint8 param2);

    function getMethod() public view virtual returns (string memory)
    {
        return 'test';
    }

    function emitEvent() public virtual returns (bool) {
        emit Test('abc', 123);
        return true;
    }
}
