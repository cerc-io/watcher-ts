// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.0;

contract TestEnums {
    // Variables of this enum type will need 1 byte for storage.
    enum Choices { Choice0, Choice1, Choice2, Choice3 }

    // Enum type variables are packed together in a slot as they occupy less than 32 bytes together.
    Choices choicesEnum1;
    Choices choicesEnum2;

    // Set variable choicesEnum1.
    function setChoicesEnum1(Choices value) external {
        choicesEnum1 = value;
    }
}
