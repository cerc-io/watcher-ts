// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "./TestContractTypes.sol";

contract TestValueStructs {
    struct SingleSlotStruct {
        int16 int1;
        uint8 uint1;
    }

    // Struct variable will use one single slot as size of the members is less than 32 bytes.
    SingleSlotStruct singleSlotStruct;

    struct MultipleSlotStruct {
        uint128 uint1;
        bool bool1;
        int192 int1;
    }

    // Struct variable will use multiple slots as size of the members is more than 32 bytes.
    MultipleSlotStruct multipleSlotStruct;

    struct AddressStruct {
        int8 int1;
        address address1;
        address address2;
        uint16 uint1;
    }

    AddressStruct addressStruct;

    struct ContractStruct {
        uint16 uint1;
        TestContractTypes testContract;
    }

    ContractStruct contractStruct;

    struct FixedBytesStruct {
        uint8 uint1;
        bytes10 bytesTen;
        bytes20 bytesTwenty;
    }

    FixedBytesStruct fixedBytesStruct;

    enum Choices { Choice0, Choice1, Choice2, Choice3 }

    struct EnumStruct {
        uint32 uint1;
        Choices choice1;
        Choices choice2;
    }

    EnumStruct enumStruct;

    // Set variable singleSlotStruct.
    function setSingleSlotStruct(int16 int1Value, uint8 uint1Value) external {
        singleSlotStruct.int1 = int1Value;
        singleSlotStruct.uint1 = uint1Value;
    }

    // Set variable multipleSlotStruct.
    function setMultipleSlotStruct(uint128 uint1Value, bool bool1Value, int192 int1Value) external {
        multipleSlotStruct.uint1 = uint1Value;
        multipleSlotStruct.bool1 = bool1Value;
        multipleSlotStruct.int1 = int1Value;
    }

    // Set variable addressStruct.
    function setAddressStruct(AddressStruct calldata value) external {
        addressStruct = value;
    }

    // Set variable contractStruct.
    function setContractStruct(uint16 uint1Value, TestContractTypes contractValue) external {
        contractStruct.uint1 = uint1Value;
        contractStruct.testContract = contractValue;
    }

    // Set variable fixedBytesStruct.
    function setFixedBytesStruct(uint8 uint1Value, bytes10 bytesTenValue, bytes20 bytesTwentyValue) external {
        fixedBytesStruct.uint1 = uint1Value;
        fixedBytesStruct.bytesTen = bytesTenValue;
        fixedBytesStruct.bytesTwenty = bytesTwentyValue;
    }

    // Set variable enumStruct.
    function setEnumStruct(uint32 uint1Value, Choices choice1Value, Choices choice2Value) external {
        enumStruct.uint1 = uint1Value;
        enumStruct.choice1 = choice1Value;
        enumStruct.choice2 = choice2Value;
    }
}
