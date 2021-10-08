import { TypeId } from './types';

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
