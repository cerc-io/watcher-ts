import { BigNumber } from 'ethers';
import { TypeId, ValueKind } from './types';

interface EventParam {
  name: string;
  value: any;
  kind: string;
}

/**
 * Method to create ethereum event.
 * @param exports
 * @param contractAddress
 * @param eventParamsData
 * @returns
 */
export const createEvent = async (exports: any, contractAddress: string, eventParamsData: EventParam[]): Promise<any> => {
  const {
    __newString,
    __newArray,
    Address,
    BigInt,
    ethereum,
    Bytes,
    ByteArray,
    id_of_type: idOfType
  } = exports;

  // Create dummy block data.
  const block = await ethereum.Block.__new(
    await Bytes.empty(),
    await Bytes.empty(),
    await Bytes.empty(),
    await Address.zero(),
    await Bytes.empty(),
    await Bytes.empty(),
    await Bytes.empty(),
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    null
  );

  // Create dummy transaction data.
  const transaction = await ethereum.Transaction.__new(
    await Bytes.empty(),
    await BigInt.fromI32(0),
    await Address.zero(),
    null,
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    await Bytes.empty()
  );

  const eventParamArrayPromise = eventParamsData.map(async data => {
    const { name, value, kind } = data;
    let ethValue;

    switch (kind) {
      case 'unsignedBigInt': {
        const bigIntString = await (await __newString(value.toString()));
        const bigInt = await BigInt.fromString(bigIntString);
        ethValue = await ethereum.Value.fromUnsignedBigInt(bigInt);
        break;
      }

      case 'string': {
        ethValue = await ethereum.Value.fromString(await __newString(value));
        break;
      }

      case 'i32': {
        ethValue = await ethereum.Value.fromI32(value);
        break;
      }

      case 'address': {
        ethValue = await ethereum.Value.fromAddress(await Address.fromString(await __newString(value)));
        break;
      }

      case 'bytes': {
        const byteArray = await ByteArray.fromHexString(await __newString(value));
        ethValue = await ethereum.Value.fromBytes(await Bytes.fromByteArray(byteArray));
        break;
      }

      default:
        break;
    }

    return ethereum.EventParam.__new(
      await __newString(name),
      ethValue
    );
  });

  const eventParamArray = await Promise.all(eventParamArrayPromise);
  const eventParams = await __newArray(await idOfType(TypeId.ArrayEventParam), eventParamArray);

  // Dummy contract address string.
  const addStrPtr = await __newString(contractAddress);

  // Create Test event to be passed to handler.
  return ethereum.Event.__new(
    await Address.fromString(addStrPtr),
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    null,
    block,
    transaction,
    eventParams
  );
};

/**
 * Method to get value from graph-ts ethereum.Value wasm instance.
 * @param exports
 * @param value
 * @returns
 */
export const fromEthereumValue = async (exports: any, value: any): Promise<any> => {
  const {
    __getString,
    BigInt,
    Address
  } = exports;

  const kind = await value.kind;

  switch (kind) {
    case ValueKind.ADDRESS: {
      const address = Address.wrap(await value.toAddress());
      const addressStringPtr = await address.toHexString();
      return __getString(addressStringPtr);
    }

    case ValueKind.BOOL: {
      const bool = await value.toBoolean();
      return Boolean(bool);
    }

    case ValueKind.BYTES:
    case ValueKind.FIXED_BYTES: {
      const bytes = await value.toBytes();
      const bytesStringPtr = await bytes.toHexString();
      return __getString(bytesStringPtr);
    }

    case ValueKind.INT:
    case ValueKind.UINT: {
      const bigInt = BigInt.wrap(await value.toBigInt());
      const bigIntStringPtr = await bigInt.toString();
      const bigIntString = __getString(bigIntStringPtr);
      return BigNumber.from(bigIntString);
    }

    default:
      break;
  }
};

/**
 * Method to get ethereum value for passing to wasm instance.
 * @param exports
 * @param value
 * @param type
 * @returns
 */
export const toEthereumValue = async (exports: any, value: any, type: string): Promise<any> => {
  const {
    __newString,
    ByteArray,
    Bytes,
    Address,
    ethereum,
    BigInt
  } = exports;

  // For boolean type.
  if (type === 'bool') {
    return ethereum.Value.fromBoolean(value ? 1 : 0);
  }

  const [isIntegerOrEnum, isInteger, isUnsigned] = type.match(/^enum|((u?)int([0-9]+))/) || [false];

  // For uint/int type or enum type.
  if (isIntegerOrEnum) {
    const valueString = await __newString(value.toString());
    const bigInt = await BigInt.fromString(valueString);
    let ethereumValue = await ethereum.Value.fromUnsignedBigInt(bigInt);

    if (Boolean(isInteger) && !isUnsigned) {
      ethereumValue = await ethereum.Value.fromSignedBigInt(bigInt);
    }

    return ethereumValue;
  }

  if (type.startsWith('address')) {
    return ethereum.Value.fromAddress(await Address.fromString(await __newString(value)));
  }

  // TODO: Check between fixed bytes and dynamic bytes.
  if (type.startsWith('bytes')) {
    const byteArray = await ByteArray.fromHexString(await __newString(value));
    const bytes = await Bytes.fromByteArray(byteArray);
    return ethereum.Value.fromBytes(bytes);
  }

  // For string type.
  return ethereum.Value.fromString(await __newString(value));
};
