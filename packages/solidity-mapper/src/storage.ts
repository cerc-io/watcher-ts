import { utils, BigNumber } from 'ethers';

interface Storage {
  slot: string;
  offset: number;
  type: string;
  label: string;
}

interface Types {
  [type: string]: {
    encoding: string;
    numberOfBytes: string;
    label: string;
    base?: string;
    value?: string;
    key?: string;
    members?: Storage[];
  };
}

type MappingKey = string | boolean | number;

export interface StorageLayout {
  storage: Storage[];
  types: Types
}

export interface StorageInfo extends Storage {
  types: Types
}

export type GetStorageAt = (param: { blockHash: string, contract: string, slot: string }) => Promise<{ value: string, proof: { data: string } }>

/**
 * Function to get storage information of variable from storage layout.
 * @param storageLayout
 * @param variableName
 */
export const getStorageInfo = (storageLayout: StorageLayout, variableName: string): StorageInfo => {
  const { storage, types } = storageLayout;
  const targetState = storage.find((state) => state.label === variableName);

  // Throw if state variable could not be found in storage layout.
  if (!targetState) {
    throw new Error('Variable not present in storage layout.');
  }

  return {
    ...targetState,
    slot: utils.hexlify(BigNumber.from(targetState.slot)),
    types
  };
};

/**
 * Function to get the value from storage for a contract variable.
 * @param storageLayout
 * @param getStorageAt
 * @param blockHash
 * @param address
 * @param variableName
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const getStorageValue = async (storageLayout: StorageLayout, getStorageAt: GetStorageAt, blockHash: string, address: string, variableName: string, ...mappingKeys: Array<MappingKey>): Promise<{ value: any, proof: { data: string } }> => {
  const { slot, offset, type, types } = getStorageInfo(storageLayout, variableName);

  return getDecodedValue(getStorageAt, blockHash, address, types, { slot, offset, type }, mappingKeys);
};

/**
 * Get value according to type described by the label.
 * @param storageValue
 * @param typeLabel
 */
export const getValueByType = (storageValue: string, typeLabel: string): bigint | string | boolean => {
  // Parse value for boolean type.
  if (typeLabel === 'bool') {
    return !BigNumber.from(storageValue).isZero();
  }

  // Parse value for uint/int type or enum type.
  if (typeLabel.match(/^enum|u?int[0-9]+/)) {
    return BigInt(storageValue);
  }

  // Parse value for string type.
  if (typeLabel.includes('string')) {
    return utils.toUtf8String(storageValue);
  }

  return storageValue;
};

/**
 * Function to get decoded value according to type and encoding.
 * @param getStorageAt
 * @param blockHash
 * @param address
 * @param types
 * @param storageInfo
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const getDecodedValue = async (getStorageAt: GetStorageAt, blockHash: string, address: string, types: Types, storageInfo: { slot: string, offset: number, type: string }, mappingKeys: Array<MappingKey>): Promise<{ value: any, proof: { data: string } }> => {
  const { slot, offset, type } = storageInfo;
  const { encoding, numberOfBytes, label: typeLabel, base, value: mappingValueType, key: mappingKeyType, members } = types[type];

  let value: string, proof: { data: string };
  const [isArray, arraySize] = typeLabel.match(/\[([0-9]+)\]$/) || [false];

  // If variable is array type.
  if (Boolean(isArray) && base) {
    return getArrayValue(getStorageAt, blockHash, address, types, mappingKeys, slot, base, Number(arraySize));
  }

  const isStruct = /^struct .+/.test(typeLabel);

  // If variable is struct type.
  if (isStruct && members) {
    return getStructureValue(getStorageAt, blockHash, address, types, mappingKeys, slot, members);
  }

  // Get value according to encoding i.e. how the data is encoded in storage.
  // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#json-output
  switch (encoding) {
    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#layout-of-state-variables-in-storage
    case 'inplace':
      ({ value, proof } = await getInplaceValue(getStorageAt, blockHash, address, slot, offset, numberOfBytes));
      break;

    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#bytes-and-string
    case 'bytes':
      ({ value, proof } = await getBytesValue(getStorageAt, blockHash, address, slot));
      break;

    case 'mapping': {
      if (mappingValueType && mappingKeyType) {
        const mappingSlot = getMappingSlot(types, slot, mappingKeyType, mappingKeys[0]);

        return getDecodedValue(getStorageAt, blockHash, address, types, { slot: mappingSlot, offset: 0, type: mappingValueType }, mappingKeys.slice(1));
      } else {
        throw new Error(`Mapping value type not specified for ${mappingKeys[0]}`);
      }

      break;
    }

    case 'dynamic_array': {
      if (base) {
        const { slot: dynamicArraySlot, size } = await getDynamicArrayInfo(getStorageAt, blockHash, address, slot, offset, numberOfBytes);

        return getArrayValue(getStorageAt, blockHash, address, types, mappingKeys, dynamicArraySlot, base, size);
      } else {
        throw new Error('Missing base type for dynamic array.');
      }

      break;
    }

    default:
      throw new Error(`Encoding ${encoding} not implemented.`);
  }

  return {
    value: getValueByType(value, typeLabel),
    proof
  };
};

/**
 * Function to get slot for mapping types.
 * @param mappingSlot
 * @param key
 */
export const getMappingSlot = (types: Types, mappingSlot: string, keyType: string, key: MappingKey): string => {
  const { encoding, label: typeLabel } = types[keyType];

  // If key is boolean type convert to 1 or 0 which is the way value is stored in memory.
  if (typeLabel === 'bool') {
    key = key ? 1 : 0;
  }

  // If key is string convert to hex string representation.
  if (typeLabel === 'string' && typeof key === 'string') {
    key = utils.hexlify(utils.toUtf8Bytes(key));
  }

  // If key is still boolean type the argument passed as key is invalid.
  if (typeof key === 'boolean') {
    throw new Error('Invalid key.');
  }

  // https://github.com/ethers-io/ethers.js/issues/1079#issuecomment-703056242
  const mappingSlotPadded = utils.hexZeroPad(mappingSlot, 32);

  const keyPadded = encoding === 'bytes'
    ? utils.hexlify(key)
    : utils.hexZeroPad(utils.hexlify(key), 32);

  // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#mappings-and-dynamic-arrays
  const fullKey = utils.concat([
    keyPadded,
    mappingSlotPadded
  ]);

  const slot = utils.keccak256(fullKey);
  return slot;
};

const getDynamicArrayInfo = async (getStorageAt: GetStorageAt, blockHash: string, address: string, slot: string, offset: number, numberOfBytes: string) => {
  const { value } = await getInplaceValue(getStorageAt, blockHash, address, slot, offset, numberOfBytes);
  const size = Number(getValueByType(value, 'uint'));
  const paddedSlot = utils.hexZeroPad(slot, 32);
  slot = utils.keccak256(paddedSlot);

  return { size, slot };
};

const getArrayValue = async (getStorageAt: GetStorageAt, blockHash: string, address: string, types: Types, mappingKeys: MappingKey[], slot: string, base: string, arraySize: number) => {
  const resultArray = [];
  const proofs = [];
  const { numberOfBytes: baseNumberOfBytes } = types[base];

  const getArrayElement = async (mappingKeys: MappingKey[], index: number) => {
    let arraySlotOffset = 0;
    let slotIndex;

    if (Number(baseNumberOfBytes) <= 32) {
      const elementsInSlot = Math.floor(32 / Number(baseNumberOfBytes));
      slotIndex = Math.floor(index / elementsInSlot);
      arraySlotOffset = (index % elementsInSlot) * Number(baseNumberOfBytes);
    } else {
      const slotsUsedByElement = Math.ceil(Number(baseNumberOfBytes) / 32);
      slotIndex = slotsUsedByElement * index;
    }

    const arraySlot = BigNumber.from(slot).add(slotIndex).toHexString();

    return getDecodedValue(getStorageAt, blockHash, address, types, { slot: arraySlot, offset: arraySlotOffset, type: base }, mappingKeys);
  };

  const [arrayIndex, ...remainingKeys] = mappingKeys;

  if (typeof arrayIndex === 'number') {
    return getArrayElement(remainingKeys, arrayIndex);
  }

  // Loop over elements of array and get value.
  for (let i = 0; i < arraySize; i++) {
    const { value, proof } = await getArrayElement(mappingKeys, i);
    resultArray.push(value);

    // Each element in array gets its own proof even if it is packed.
    proofs.push(JSON.parse(proof.data));
  }

  return {
    value: resultArray,
    proof: {
      data: JSON.stringify(proofs)
    }
  };
};

const getStructureValue = async (getStorageAt: GetStorageAt, blockHash: string, address: string, types: Types, mappingKeys: MappingKey[], slot: string, members: Storage[]) => {
  // Get value of specified member in struct.
  const getStructMember = async (mappingKeys: MappingKey[], member: Storage) => {
    const structSlot = BigNumber.from(slot).add(member.slot).toHexString();

    return getDecodedValue(getStorageAt, blockHash, address, types, { slot: structSlot, offset: member.offset, type: member.type }, mappingKeys);
  };

  const [memberName, ...remainingKeys] = mappingKeys;
  const member = members.find(member => member.label === memberName);

  // If member name passed in argument is present.
  if (member) {
    return getStructMember(remainingKeys, member);
  }

  // TODO: Get values in single call and parse according to type.
  // Get member values specified for the struct in storage layout.
  const resultPromises = members.map(async member => {
    return getStructMember(mappingKeys, member);
  });

  const results = await Promise.all(resultPromises);

  const initialValue: {
    value: {[key: string]: any},
    proof: { data: string }
  } = {
    value: {},
    proof: { data: JSON.stringify({}) }
  };

  // Return struct type value as an object with keys as the struct member labels.
  return members.reduce((acc, member, index) => {
    acc.value[member.label] = results[index].value;
    const proofData = JSON.parse(acc.proof.data);
    proofData[member.label] = results[index].proof;
    acc.proof.data = JSON.stringify(proofData);
    return acc;
  }, initialValue);
};

/**
 * Function to get value for inplace encoding.
 * @param address
 * @param slot
 * @param offset
 * @param numberOfBytes
 * @param getStorageAt
 */
const getInplaceValue = async (getStorageAt: GetStorageAt, blockHash: string, address: string, slot: string, offset: number, numberOfBytes: string) => {
  // TODO: Memoize getStorageAt function for duplicate multiple calls.
  const { value, proof } = await getStorageAt({ blockHash, contract: address, slot });
  const valueLength = utils.hexDataLength(value);

  // Get value according to offset.
  const start = valueLength - (offset + Number(numberOfBytes));
  const end = valueLength - offset;

  return {
    value: utils.hexDataSlice(value, start, end),
    proof
  };
};

/**
 * Function to get value for bytes encoding.
 * @param address
 * @param slot
 * @param getStorageAt
 */
const getBytesValue = async (getStorageAt: GetStorageAt, blockHash: string, address: string, slot: string) => {
  const { value, proof } = await getStorageAt({ blockHash, contract: address, slot });
  let length = 0;

  // Get length of bytes stored.
  if (BigNumber.from(utils.hexDataSlice(value, 0, 1)).isZero()) {
    // If first byte is not set, get length directly from the zero padded byte array.
    const slotValue = BigNumber.from(value);
    length = slotValue.sub(1).div(2).toNumber();
  } else {
    // If first byte is set the length is lesser than 32 bytes.
    // Length of the value can be computed from the last byte.
    const lastByteHex = utils.hexDataSlice(value, 31, 32);
    length = BigNumber.from(lastByteHex).div(2).toNumber();
  }

  // Get value from the byte array directly if length is less than 32.
  if (length < 32) {
    return {
      value: utils.hexDataSlice(value, 0, length),
      proof
    };
  }

  // Array to hold multiple bytes32 data.
  const proofs = [
    JSON.parse(proof.data)
  ];
  const hexStringArray = [];

  // Compute zero padded hexstring to calculate hashed position of storage.
  // https://github.com/ethers-io/ethers.js/issues/1079#issuecomment-703056242
  const paddedSlotHex = utils.hexZeroPad(slot, 32);
  const position = utils.keccak256(paddedSlotHex);

  // Get value from consecutive storage slots for longer data.
  for (let i = 0; i < length / 32; i++) {
    const { value, proof } = await getStorageAt({
      blockHash,
      contract: address,
      slot: BigNumber.from(position).add(i).toHexString()
    });

    hexStringArray.push(value);
    proofs.push(JSON.parse(proof.data));
  }

  // Slice trailing bytes according to length of value.
  return {
    value: utils.hexDataSlice(utils.hexConcat(hexStringArray), 0, length),
    proof: {
      data: JSON.stringify(proofs)
    }
  };
};
