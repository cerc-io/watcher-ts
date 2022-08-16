// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

contract Example {
    uint256 private _test;

    mapping (address => uint128) public addressUintMap;

    struct Bid {
        uint128 bidAmount1;
        uint128 bidAmount2;
    }

    event Test(string param1, uint8 param2, uint256 param3);

    constructor() {
        _test = 1;
        addressUintMap[address(0)] = 123;
    }

    function getMethod() public view virtual returns (string memory)
    {
        return 'test';
    }

    function addMethod(uint128 bidAmount1, uint128 bidAmount2) public pure returns (uint) {
        return bidAmount1 + bidAmount2;
    }

    function structMethod(uint128 bidAmount1, uint128 bidAmount2) public pure returns (Bid memory) {
        Bid memory bid;
        bid.bidAmount1 = bidAmount2;
        bid.bidAmount2 = bidAmount1;

        return bid;
    }

    function emitEvent() public virtual returns (bool) {
        emit Test('abc', 150, 564894232132154);

        return true;
    }
}
