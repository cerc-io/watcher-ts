// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestReferenceStructs {
    struct FixedArrayStruct {
        int8 int1;
        uint16[4] uintArray;
        address[3] addressArray;
    }

    FixedArrayStruct fixedArrayStruct;

    struct StringStruct {
        string string1;
        uint8 uint1;
        string string2;
    }

    StringStruct stringStruct;

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

    // Set variable fixedArrayStruct.
    function setFixedArrayStruct(int8 int1Value, uint16[4] calldata uintArrayValue, address[3] calldata addressArrayValue) external {
        fixedArrayStruct.int1 = int1Value;
        fixedArrayStruct.uintArray = uintArrayValue;
        fixedArrayStruct.addressArray = addressArrayValue;
    }

    // Set variable stringStruct.
    function setStringStruct(string calldata string1Value, uint8 uint1Value, string calldata string2Value) external {
        stringStruct.string1 = string1Value;
        stringStruct.uint1 = uint1Value;
        stringStruct.string2 = string2Value;
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
}
