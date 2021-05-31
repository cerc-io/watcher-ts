import { utils, BigNumber } from 'ethers';

export interface StorageLayout {
  storage: [{
    slot: string;
    offset: number;
    type: string;
    label: string;
  }];
  types: {
    [type: string]: {
      encoding: string;
      numberOfBytes: string;
      label: string;
    }
  };
}

export type GetStorageAt = (address: string, position: string) => Promise<string>

/**
 * Function to get the value from storage for a contract variable.
 * @param address
 * @param storageLayout
 * @param getStorageAt
 * @param variableName
 */
export const getStorageValue = async (address: string, storageLayout: StorageLayout, getStorageAt: GetStorageAt, variableName: string): Promise<number | string | boolean | undefined> => {
  const { storage, types } = storageLayout;
  const targetState = storage.find((state) => state.label === variableName)

  // Return if state variable could not be found in storage layout.
  if (!targetState) {
    return;
  }

  const { slot, offset, type } = targetState;
  const { encoding, numberOfBytes, label } = types[type]

  // Get value according to encoding i.e. how the data is encoded in storage.
  // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#json-output
  switch (encoding) {
    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#layout-of-state-variables-in-storage
    case 'inplace': {
      const valueArray = await getInplaceArray(address, slot, offset, numberOfBytes, getStorageAt);

      // Parse value for address type.
      if (['address', 'address payable'].some(type => type === label)) {
        return utils.hexlify(valueArray);
      }

      // Parse value for boolean type.
      if (label === 'bool') {
        return !BigNumber.from(valueArray).isZero();
      }

      // Parse value for uint/int type.
      return BigNumber.from(valueArray).toNumber();
    }

    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#bytes-and-string
    case 'bytes': {
      const valueArray = await getBytesArray(address, slot, getStorageAt);

      return utils.toUtf8String(valueArray)
    }

    default:
      break;
  }
}

/**
 * Function to get array value for inplace encoding.
 * @param address
 * @param slot
 * @param offset
 * @param numberOfBytes
 * @param getStorageAt
 */
const getInplaceArray = async (address: string, slot: string, offset: number, numberOfBytes: string, getStorageAt: GetStorageAt) => {
  const value = await getStorageAt(address, BigNumber.from(slot).toHexString());
  const uintArray = utils.arrayify(value);

  // Get value according to offset.
  const start = uintArray.length - (offset + Number(numberOfBytes));
  const end = uintArray.length - offset;
  const offsetArray = uintArray.slice(start, end)

  return offsetArray;
}

/**
 * Function to get array value for bytes encoding.
 * @param address
 * @param slot
 * @param getStorageAt
 */
const getBytesArray = async (address: string, slot: string, getStorageAt: GetStorageAt) => {
  let value = await getStorageAt(address, BigNumber.from(slot).toHexString());
  const uintArray = utils.arrayify(value);
  let length = 0;

  // Get length of bytes stored.
  if (BigNumber.from(uintArray[0]).isZero()) {
    // If first byte is not set, get length directly from the zero padded byte array.
    const slotValue = BigNumber.from(value);
    length = slotValue.sub(1).div(2).toNumber();
  } else {
    // If first byte is set the length is lesser than 32 bytes.
    // Length of the value can be computed from the last byte.
    length = BigNumber.from(uintArray[uintArray.length - 1]).div(2).toNumber();
  }

  // Get value from the byte array directly if length is less than 32.
  if (length < 32) {
    return uintArray.slice(0, length);
  }

  // Array to hold multiple bytes32 data.
  const values = [];

  // Compute zero padded hexstring to calculate hashed position of storage.
  // https://github.com/ethers-io/ethers.js/issues/1079#issuecomment-703056242
  const slotHex = utils.hexZeroPad(BigNumber.from(slot).toHexString(), 32);
  const position = utils.keccak256(slotHex);

  // Get value from consecutive storage slots for longer data.
  for(let i = 0; i < length / 32; i++) {
    const value = await getStorageAt(address, BigNumber.from(position).add(i).toHexString());
    values.push(value);
  }

  // Slice trailing bytes according to length of value.
  return utils.concat(values).slice(0, length);
}
