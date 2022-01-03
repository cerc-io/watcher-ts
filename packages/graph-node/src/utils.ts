import { BigNumber, utils } from 'ethers';
import path from 'path';
import fs from 'fs-extra';
import debug from 'debug';
import yaml from 'js-yaml';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';

import { GraphDecimal } from '@vulcanize/util';

import { TypeId, EthereumValueKind, ValueKind } from './types';

const log = debug('vulcanize:utils');

export const INT256_MIN = '-57896044618658097711785492504343953926634992332820282019728792003956564819968';
export const INT256_MAX = '57896044618658097711785492504343953926634992332820282019728792003956564819967';
export const UINT128_MAX = '340282366920938463463374607431768211455';
export const UINT256_MAX = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

// Maximum decimal value.
export const DECIMAL128_MAX = '9.999999999999999999999999999999999e+6144';
// Minimum decimal value.
export const DECIMAL128_MIN = '-9.999999999999999999999999999999999e+6144';

// Minimum +ve decimal value.
export const DECIMAL128_PMIN = '1e-6143';
// Maximum -ve decimal value.
export const DECIMAL128_NMAX = '-1e-6143';

export interface Transaction {
  hash: string;
  index: number;
  from: string;
  to: string;
  value: string;
  gasLimit: string;
  gasPrice: string;
  input: string;
}

export interface Block {
  headerId: number;
  blockHash: string;
  blockNumber: string;
  timestamp: string;
  parentHash: string;
  stateRoot: string;
  td: string;
  txRoot: string;
  receiptRoot: string;
  uncleHash: string;
  difficulty: string;
  gasLimit: string;
  gasUsed: string;
  author: string;
  size: string;
}

export interface EventData {
  block: Block;
  tx: Transaction;
  inputs: utils.ParamType[];
  event: { [key: string]: any }
  eventIndex: number;
}

export const getEthereumTypes = async (instanceExports: any, value: any): Promise<any> => {
  const {
    __getArray,
    Bytes,
    ethereum
  } = instanceExports;

  const kind = await value.kind;

  switch (kind) {
    case EthereumValueKind.ADDRESS:
      return 'address';

    case EthereumValueKind.BOOL:
      return 'bool';

    case EthereumValueKind.STRING:
      return 'string';

    case EthereumValueKind.BYTES:
      return 'bytes';

    case EthereumValueKind.FIXED_BYTES: {
      const bytesPtr = await value.toBytes();
      const bytes = await Bytes.wrap(bytesPtr);
      const length = await bytes.length;

      return `bytes${length}`;
    }

    case EthereumValueKind.INT:
      return 'int256';

    case EthereumValueKind.UINT: {
      return 'uint256';
    }

    case EthereumValueKind.ARRAY: {
      const valuesPtr = await value.toArray();
      const [firstValuePtr] = await __getArray(valuesPtr);
      const firstValue = await ethereum.Value.wrap(firstValuePtr);
      const type = await getEthereumTypes(instanceExports, firstValue);

      return `${type}[]`;
    }

    case EthereumValueKind.FIXED_ARRAY: {
      const valuesPtr = await value.toArray();
      const values = await __getArray(valuesPtr);
      const firstValue = await ethereum.Value.wrap(values[0]);
      const type = await getEthereumTypes(instanceExports, firstValue);

      return `${type}[${values.length}]`;
    }

    case EthereumValueKind.TUPLE: {
      let values = await value.toTuple();
      values = await __getArray(values);

      const typePromises = values.map(async (value: any) => {
        value = await ethereum.Value.wrap(value);
        return getEthereumTypes(instanceExports, value);
      });

      const types = await Promise.all(typePromises);

      return `tuple(${types.join(',')})`;
    }

    default:
      break;
  }
};

/**
 * Method to get value from graph-ts ethereum.Value wasm instance.
 * @param instanceExports
 * @param value
 * @returns
 */
export const fromEthereumValue = async (instanceExports: any, value: any): Promise<any> => {
  const {
    __getArray,
    __getString,
    BigInt,
    Address,
    Bytes,
    ethereum
  } = instanceExports;

  const kind = await value.kind;

  switch (kind) {
    case EthereumValueKind.ADDRESS: {
      const addressPtr = await value.toAddress();
      const address = Address.wrap(addressPtr);
      const addressStringPtr = await address.toHexString();
      return __getString(addressStringPtr);
    }

    case EthereumValueKind.BOOL: {
      const bool = await value.toBoolean();
      return Boolean(bool);
    }

    case EthereumValueKind.STRING: {
      const stringPtr = await value.toString();
      return __getString(stringPtr);
    }

    case EthereumValueKind.BYTES:
    case EthereumValueKind.FIXED_BYTES: {
      const bytesPtr = await value.toBytes();
      const bytes = await Bytes.wrap(bytesPtr);
      const bytesStringPtr = await bytes.toHexString();
      return __getString(bytesStringPtr);
    }

    case EthereumValueKind.INT:
    case EthereumValueKind.UINT: {
      const bigIntPtr = await value.toBigInt();
      const bigInt = BigInt.wrap(bigIntPtr);
      const bigIntStringPtr = await bigInt.toString();
      const bigIntString = __getString(bigIntStringPtr);
      return BigNumber.from(bigIntString);
    }

    case EthereumValueKind.ARRAY:
    case EthereumValueKind.FIXED_ARRAY: {
      const valuesPtr = await value.toArray();
      const values = __getArray(valuesPtr);

      const valuePromises = values.map(async (value: any) => {
        value = await ethereum.Value.wrap(value);
        return fromEthereumValue(instanceExports, value);
      });

      return Promise.all(valuePromises);
    }

    case EthereumValueKind.TUPLE: {
      let values = await value.toTuple();
      values = await __getArray(values);

      const valuePromises = values.map(async (value: any) => {
        value = await ethereum.Value.wrap(value);
        return fromEthereumValue(instanceExports, value);
      });

      return Promise.all(valuePromises);
    }

    default:
      break;
  }
};

/**
 * Method to get ethereum value for passing to wasm instance.
 * @param instanceExports
 * @param value
 * @param type
 * @returns
 */
export const toEthereumValue = async (instanceExports: any, output: utils.ParamType, value: any): Promise<any> => {
  const {
    __newString,
    __newArray,
    ByteArray,
    Bytes,
    Address,
    ethereum,
    BigInt,
    id_of_type: getIdOfType
  } = instanceExports;

  const { type, baseType, arrayChildren } = output;

  // For array type.
  if (baseType === 'array') {
    const arrayEthereumValueId = await getIdOfType(TypeId.ArrayEthereumValue);

    // Get values for array elements.
    const ethereumValuePromises = value.map(
      async (value: any) => toEthereumValue(
        instanceExports,
        arrayChildren,
        value
      )
    );

    const ethereumValues: any[] = await Promise.all(ethereumValuePromises);
    const ethereumValuesArray = await __newArray(arrayEthereumValueId, ethereumValues);

    return ethereum.Value.fromArray(ethereumValuesArray);
  }

  // For tuple type.
  if (type === 'tuple') {
    const arrayEthereumValueId = await getIdOfType(TypeId.ArrayEthereumValue);

    // Get values for struct elements.
    const ethereumValuePromises = output.components
      .map(
        async (component: utils.ParamType, index) => toEthereumValue(
          instanceExports,
          component,
          value[index]
        )
      );

    const ethereumValues: any[] = await Promise.all(ethereumValuePromises);
    const ethereumValuesArrayPtr = await __newArray(arrayEthereumValueId, ethereumValues);
    const ethereumTuple = await ethereum.Tuple.wrap(ethereumValuesArrayPtr);

    return ethereum.Value.fromTuple(ethereumTuple);
  }

  // For boolean type.
  if (type === 'bool') {
    return ethereum.Value.fromBoolean(value ? 1 : 0);
  }

  const [isIntegerOrEnum, isInteger, isUnsigned] = type.match(/^enum|((u?)int([0-9]+))/) || [false];

  // For uint/int type or enum type.
  if (isIntegerOrEnum) {
    const valueStringPtr = await __newString(value.toString());
    const bigInt = await BigInt.fromString(valueStringPtr);
    let ethereumValue = await ethereum.Value.fromUnsignedBigInt(bigInt);

    if (Boolean(isInteger) && !isUnsigned) {
      ethereumValue = await ethereum.Value.fromSignedBigInt(bigInt);
    }

    return ethereumValue;
  }

  if (type.startsWith('address')) {
    const valueStringPtr = await __newString(value);
    const addressPtr = await Address.fromString(valueStringPtr);

    return ethereum.Value.fromAddress(addressPtr);
  }

  // TODO: Check between fixed bytes and dynamic bytes.
  if (type.startsWith('bytes')) {
    const valueStringPtr = await __newString(value);
    const byteArray = await ByteArray.fromHexString(valueStringPtr);
    const bytes = await Bytes.fromByteArray(byteArray);
    return ethereum.Value.fromBytes(bytes);
  }

  // For string type.
  const valueStringPtr = await __newString(value);
  return ethereum.Value.fromString(valueStringPtr);
};

/**
 * Method to create ethereum event.
 * @param instanceExports
 * @param contractAddress
 * @param eventParamsData
 * @returns
 */
export const createEvent = async (instanceExports: any, contractAddress: string, eventData: EventData): Promise<any> => {
  const {
    tx,
    eventIndex,
    inputs,
    event,
    block: blockData
  } = eventData;

  const {
    __newString,
    __newArray,
    Address,
    BigInt,
    ethereum,
    Bytes,
    ByteArray,
    id_of_type: idOfType
  } = instanceExports;

  const block = await createBlock(instanceExports, blockData);

  // Fill transaction data.
  const txHashStringPtr = await __newString(tx.hash);
  const txHashByteArray = await ByteArray.fromHexString(txHashStringPtr);
  const txHash = await Bytes.fromByteArray(txHashByteArray);

  const txIndex = await BigInt.fromI32(tx.index);

  const txFromStringPtr = await __newString(tx.from);
  const txFrom = await Address.fromString(txFromStringPtr);

  const txToStringPtr = await __newString(tx.to);
  const txTo = tx.to && await Address.fromString(txToStringPtr);

  const valueStringPtr = await __newString(tx.value);
  const txValuePtr = await BigInt.fromString(valueStringPtr);

  const gasLimitStringPtr = await __newString(tx.gasLimit);
  const txGasLimitPtr = await BigInt.fromString(gasLimitStringPtr);

  const gasPriceStringPtr = await __newString(tx.gasPrice);
  const txGasPricePtr = await BigInt.fromString(gasPriceStringPtr);

  const inputStringPtr = await __newString(tx.input);
  const txInputByteArray = await ByteArray.fromHexString(inputStringPtr);
  const txInputPtr = await Bytes.fromByteArray(txInputByteArray);

  const transaction = await ethereum.Transaction.__new(
    txHash,
    txIndex,
    txFrom,
    txTo,
    txValuePtr,
    txGasLimitPtr,
    txGasPricePtr,
    txInputPtr
  );

  const eventParamArrayPromise = inputs.map(async input => {
    const { name } = input;

    const ethValue = await toEthereumValue(instanceExports, input, event[name]);
    const namePtr = await __newString(name);

    return ethereum.EventParam.__new(
      namePtr,
      ethValue
    );
  });

  const eventParamArray = await Promise.all(eventParamArrayPromise);
  const arrayEventParamId = await idOfType(TypeId.ArrayEventParam);
  const eventParams = await __newArray(arrayEventParamId, eventParamArray);

  const addStrPtr = await __newString(contractAddress);
  const eventAddressPtr = await Address.fromString(addStrPtr);

  const eventIndexPtr = await BigInt.fromI32(eventIndex);
  const transactionLogIndexPtr = await BigInt.fromI32(0);

  // Create event to be passed to handler.
  return ethereum.Event.__new(
    eventAddressPtr,
    eventIndexPtr,
    transactionLogIndexPtr,
    null,
    block,
    transaction,
    eventParams
  );
};

export const createBlock = async (instanceExports: any, blockData: Block): Promise<any> => {
  const {
    __newString,
    Address,
    BigInt,
    ethereum,
    Bytes,
    ByteArray
  } = instanceExports;

  // Fill block data.
  const blockHashStringPtr = await __newString(blockData.blockHash);
  const blockHashByteArray = await ByteArray.fromHexString(blockHashStringPtr);
  const blockHash = await Bytes.fromByteArray(blockHashByteArray);

  const parentHashStringPtr = await __newString(blockData.parentHash);
  const parentHashByteArray = await ByteArray.fromHexString(parentHashStringPtr);
  const parentHash = await Bytes.fromByteArray(parentHashByteArray);

  const uncleHashStringPtr = await __newString(blockData.uncleHash);
  const uncleHashByteArray = await ByteArray.fromHexString(uncleHashStringPtr);
  const uncleHash = await Bytes.fromByteArray(uncleHashByteArray);

  const blockNumberStringPtr = await __newString(blockData.blockNumber);
  const blockNumber = await BigInt.fromString(blockNumberStringPtr);

  const gasUsedStringPtr = await __newString(blockData.gasUsed);
  const gasUsed = await BigInt.fromString(gasUsedStringPtr);

  const gasLimitStringPtr = await __newString(blockData.gasLimit);
  const gasLimit = await BigInt.fromString(gasLimitStringPtr);

  const timestampStringPtr = await __newString(blockData.timestamp);
  const blockTimestamp = await BigInt.fromString(timestampStringPtr);

  const stateRootStringPtr = await __newString(blockData.stateRoot);
  const stateRootByteArray = await ByteArray.fromHexString(stateRootStringPtr);
  const stateRoot = await Bytes.fromByteArray(stateRootByteArray);

  const txRootStringPtr = await __newString(blockData.txRoot);
  const transactionsRootByteArray = await ByteArray.fromHexString(txRootStringPtr);
  const transactionsRoot = await Bytes.fromByteArray(transactionsRootByteArray);

  const receiptRootStringPtr = await __newString(blockData.receiptRoot);
  const receiptsRootByteArray = await ByteArray.fromHexString(receiptRootStringPtr);
  const receiptsRoot = await Bytes.fromByteArray(receiptsRootByteArray);

  const difficultyStringPtr = await __newString(blockData.difficulty);
  const difficulty = await BigInt.fromString(difficultyStringPtr);

  const tdStringPtr = await __newString(blockData.td);
  const totalDifficulty = await BigInt.fromString(tdStringPtr);

  const authorStringPtr = await __newString(blockData.author);
  const authorPtr = await Address.fromString(authorStringPtr);

  const sizePtr = await __newString(blockData.size);
  const size = await BigInt.fromString(sizePtr);

  // Missing fields from watcher in block data:
  // author
  // size
  return await ethereum.Block.__new(
    blockHash,
    parentHash,
    uncleHash,
    authorPtr,
    stateRoot,
    transactionsRoot,
    receiptsRoot,
    blockNumber,
    gasUsed,
    gasLimit,
    blockTimestamp,
    difficulty,
    totalDifficulty,
    size
  );
};

export const getSubgraphConfig = async (subgraphPath: string): Promise<any> => {
  const configFilePath = path.resolve(path.join(subgraphPath, 'subgraph.yaml'));
  const fileExists = await fs.pathExists(configFilePath);

  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const configFile = await fs.readFile(configFilePath, 'utf8');
  const config = yaml.load(configFile);
  log('config', JSON.stringify(config, null, 2));

  return config;
};

export const toEntityValue = async (instanceExports: any, entityInstance: any, data: any, field: ColumnMetadata, type: string) => {
  const { __newString, Value } = instanceExports;
  const { isArray, propertyName, isNullable } = field;

  const entityKey = await __newString(propertyName);
  const entityValuePtr = await entityInstance.get(entityKey);
  const subgraphValue = Value.wrap(entityValuePtr);
  const value = data[propertyName];

  // Check if the entity property is nullable.
  // No need to set the property if the value is null as well.
  if (isNullable && value === null) {
    return;
  }

  const entityValue = await formatEntityValue(instanceExports, subgraphValue, type, value, isArray);

  return entityInstance.set(entityKey, entityValue);
};

export const fromEntityValue = async (instanceExports: any, entityInstance: any, key: string): Promise<any> => {
  const { __newString } = instanceExports;
  const entityKey = await __newString(key);
  const entityValuePtr = await entityInstance.get(entityKey);

  return parseEntityValue(instanceExports, entityValuePtr);
};

const parseEntityValue = async (instanceExports: any, valuePtr: number) => {
  const {
    __getString,
    __getArray,
    BigInt: ExportBigInt,
    Bytes,
    BigDecimal,
    Value
  } = instanceExports;

  const value = Value.wrap(valuePtr);
  const kind = await value.kind;

  switch (kind) {
    case ValueKind.STRING: {
      const stringValue = await value.toString();
      return __getString(stringValue);
    }

    case ValueKind.BYTES: {
      const bytesPtr = await value.toBytes();
      const bytes = await Bytes.wrap(bytesPtr);
      const bytesStringPtr = await bytes.toHexString();

      return __getString(bytesStringPtr);
    }

    case ValueKind.BOOL: {
      const bool = await value.toBoolean();

      return Boolean(bool);
    }

    case ValueKind.INT: {
      return value.toI32();
    }

    case ValueKind.BIGINT: {
      const bigIntPtr = await value.toBigInt();
      const bigInt = ExportBigInt.wrap(bigIntPtr);
      const bigIntStringPtr = await bigInt.toString();
      const bigIntString = __getString(bigIntStringPtr);

      return BigInt(bigIntString);
    }

    case ValueKind.BIGDECIMAL: {
      const bigDecimalPtr = await value.toBigDecimal();
      const bigDecimal = BigDecimal.wrap(bigDecimalPtr);
      const bigDecimalStringPtr = await bigDecimal.toString();

      return new GraphDecimal(__getString(bigDecimalStringPtr)).toFixed();
    }

    case ValueKind.ARRAY: {
      const arrayPtr = await value.toArray();
      const arr = await __getArray(arrayPtr);
      const arrDataPromises = arr.map((arrValuePtr: any) => parseEntityValue(instanceExports, arrValuePtr));

      return Promise.all(arrDataPromises);
    }

    case ValueKind.NULL: {
      return null;
    }

    default:
      throw new Error(`Unsupported value kind: ${kind}`);
  }
};

const formatEntityValue = async (instanceExports: any, subgraphValue: any, type: string, value: any, isArray: boolean): Promise<any> => {
  const { __newString, __newArray, BigInt: ExportBigInt, Value, ByteArray, Bytes, BigDecimal, id_of_type: getIdOfType } = instanceExports;

  if (isArray) {
    const dataArrayPromises = value.map((el: any) => formatEntityValue(instanceExports, subgraphValue, type, el, false));
    const dataArray = await Promise.all(dataArrayPromises);
    const arrayStoreValueId = await getIdOfType(TypeId.ArrayStoreValue);
    const valueArray = await __newArray(arrayStoreValueId, dataArray);

    return Value.fromArray(valueArray);
  }

  switch (type) {
    case 'ID':
    case 'String': {
      const entityValue = await __newString(value);

      return Value.fromString(entityValue);
    }

    case 'Boolean': {
      return Value.fromBoolean(value ? 1 : 0);
    }

    case 'Int': {
      return Value.fromI32(value);
    }

    case 'BigInt': {
      const valueStringPtr = await __newString(value.toString());
      const bigInt = await ExportBigInt.fromString(valueStringPtr);

      return Value.fromBigInt(bigInt);
    }

    case 'BigDecimal': {
      const valueStringPtr = await __newString(value.toString());
      const bigDecimal = await BigDecimal.fromString(valueStringPtr);

      return Value.fromBigDecimal(bigDecimal);
    }

    case 'Bytes': {
      const entityValue = await __newString(value);
      const byteArray = await ByteArray.fromHexString(entityValue);
      const bytes = await Bytes.fromByteArray(byteArray);

      return Value.fromBytes(bytes);
    }

    // Return default as string for enum or custom type.
    default: {
      const entityValue = await __newString(value);

      return Value.fromString(entityValue);
    }
  }
};

export const resolveEntityFieldConflicts = (entity: any): any => {
  if (entity) {
    // Remove fields blockHash and blockNumber from the entity.
    delete entity.blockHash;
    delete entity.blockNumber;

    // Rename _blockHash -> blockHash.
    if ('_blockHash' in entity) {
      entity.blockHash = entity._blockHash;
      delete entity._blockHash;
    }

    // Rename _blockNumber -> blockNumber.
    if ('_blockNumber' in entity) {
      entity.blockNumber = entity._blockNumber;
      delete entity._blockNumber;
    }
  }

  return entity;
};

export const toJSONValue = async (instanceExports: any, value: any): Promise<any> => {
  const { CustomJSONValue, JSONValueTypedMap, __newString, __newArray, id_of_type: getIdOfType } = instanceExports;

  if (!value) {
    return CustomJSONValue.fromNull();
  }

  if (Array.isArray(value)) {
    const arrayPromise = value.map(async (el: any) => toJSONValue(instanceExports, el));
    const array = await Promise.all(arrayPromise);
    const arrayJsonValueId = await getIdOfType(TypeId.ArrayJsonValue);
    const arrayPtr = __newArray(arrayJsonValueId, array);

    return CustomJSONValue.fromArray(arrayPtr);
  }

  if (typeof value === 'object') {
    const map = await JSONValueTypedMap.__new();

    const valuePromises = Object.entries(value).map(async ([key, value]) => {
      const valuePtr = await toJSONValue(instanceExports, value);
      const keyPtr = await __newString(key);
      await map.set(keyPtr, valuePtr);
    });

    await Promise.all(valuePromises);

    return CustomJSONValue.fromObject(map);
  }

  if (typeof value === 'string') {
    const stringPtr = await __newString(value);

    return CustomJSONValue.fromString(stringPtr);
  }

  if (typeof value === 'number') {
    const stringPtr = await __newString(value.toString());

    return CustomJSONValue.fromNumber(stringPtr);
  }

  if (typeof value === 'boolean') {
    return CustomJSONValue.fromBoolean(value);
  }
};
