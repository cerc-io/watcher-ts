// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.6;

// https://docs.soliditylang.org/en/v0.8.5/layout-of-source-files.html#abi-coder-pragma
pragma abicoder v2;

contract TestReferenceStructs {
    struct FixedArrayStruct {
        int8 int1;
        uint16[4] uintArray;
        address[3] addressArray;
    }

    FixedArrayStruct fixedArrayStruct;

    struct BytesStruct {
        bytes byteArray;
        address address1;
        uint256 uint1;
    }

    BytesStruct bytesStruct;

    struct StringStruct {
        string string1;
        uint24 uint1;
        string string2;
        address address1;
        bool bool1;
        int24 int1;
    }

    StringStruct stringStruct;

    struct DynamicArrayStruct {
        address address1;
        uint160[] uintArray;
    }

    DynamicArrayStruct dynamicArrayStruct;

    struct ValueMappingStruct {
        mapping(uint => address) uintAddressMap;
        uint32 uint1;
        mapping(address => int) addressIntMap;
    }

    ValueMappingStruct public valueMappingStruct;

    struct ReferenceMappingStruct {
        mapping(bytes => address) bytesAddressMap;
        mapping(string => uint) stringUintMap;
    }

    ReferenceMappingStruct referenceMappingStruct;

    struct NestedStruct {
        BytesStruct bytesStruct;
        address address1;
    }

    NestedStruct nestedStruct;

    // Set variable fixedArrayStruct.
    function setFixedArrayStruct(int8 int1Value, uint16[4] calldata uintArrayValue, address[3] calldata addressArrayValue) external {
        fixedArrayStruct.int1 = int1Value;
        fixedArrayStruct.uintArray = uintArrayValue;
        fixedArrayStruct.addressArray = addressArrayValue;
    }

    // Set variable bytesStruct.
    function setBytesStruct(BytesStruct calldata value) external {
        bytesStruct = value;
    }

    // Set variable stringStruct.
    function setStringStruct(StringStruct calldata value) external {
        stringStruct = value;
    }

    // Set variable valueMappingStruct.
    function setValueMappingStruct(uint uintAddressKey, address uintAddressValue, uint32 uint1Value, address addressIntKey, int addressIntValue) external {
        valueMappingStruct.uintAddressMap[uintAddressKey] = uintAddressValue;
        valueMappingStruct.uint1 = uint1Value;
        valueMappingStruct.addressIntMap[addressIntKey] = addressIntValue;
    }

    // Set variable referenceMappingStruct.
    function setReferenceMappingStruct(bytes calldata bytesAddressKey, address bytesAddressValue, string calldata stringUintKey, uint stringUintValue) external {
        referenceMappingStruct.bytesAddressMap[bytesAddressKey] = bytesAddressValue;
        referenceMappingStruct.stringUintMap[stringUintKey] = stringUintValue;
    }

    // Set variable nestedStruct.
    function setNestedStruct(NestedStruct calldata value) external {
        nestedStruct = value;
    }

    // Set variable dynamicArrayStruct.
    function setDynamicArrayStruct(DynamicArrayStruct calldata value) external {
        dynamicArrayStruct = value;
    }
}
