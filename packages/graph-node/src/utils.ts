import { BigNumber } from 'ethers';
import path from 'path';
import fs from 'fs-extra';
import debug from 'debug';
import yaml from 'js-yaml';
import Decimal from 'decimal.js';
import { ColumnType } from 'typeorm';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';

import { TypeId, EthereumValueKind, ValueKind } from './types';

const log = debug('vulcanize:utils');

interface EventParam {
  name: string;
  value: any;
  kind: string;
}

interface Transaction {
  hash: string;
  index: number;
  from: string;
  to: string;
}

export interface Block {
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
}

export interface EventData {
  block: Block;
  tx: Transaction;
  eventParams: EventParam[];
  eventIndex: number;
}

/**
 * Method to get value from graph-ts ethereum.Value wasm instance.
 * @param instanceExports
 * @param value
 * @returns
 */
export const fromEthereumValue = async (instanceExports: any, value: any): Promise<any> => {
  const {
    __getString,
    BigInt,
    Address
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

    case EthereumValueKind.BYTES:
    case EthereumValueKind.FIXED_BYTES: {
      const bytes = await value.toBytes();
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
export const toEthereumValue = async (instanceExports: any, value: any, type: string): Promise<any> => {
  const {
    __newString,
    ByteArray,
    Bytes,
    Address,
    ethereum,
    BigInt
  } = instanceExports;

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
    eventParams: eventParamsData,
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

  const txValuePtr = await BigInt.fromI32(0);
  const txGasLimitPtr = await BigInt.fromI32(0);
  const txGasPricePtr = await BigInt.fromI32(0);
  const txinputPtr = await Bytes.empty();

  // Missing fields from watcher in transaction data:
  // value
  // gasLimit
  // gasPrice
  // input
  const transaction = await ethereum.Transaction.__new(
    txHash,
    txIndex,
    txFrom,
    txTo,
    txValuePtr,
    txGasLimitPtr,
    txGasPricePtr,
    txinputPtr
  );

  const eventParamArrayPromise = eventParamsData.map(async data => {
    const { name, value, kind } = data;

    const ethValue = await toEthereumValue(instanceExports, value, kind);
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

  const authorPtr = await Address.zero();

  const sizePtr = await __newString('0');
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

export const toEntityValue = async (instanceExports: any, entityInstance: any, data: any, field: ColumnMetadata) => {
  const { __newString, Value } = instanceExports;
  const { type, isArray, propertyName } = field;

  const entityKey = await __newString(propertyName);
  const entityValuePtr = await entityInstance.get(entityKey);
  const subgraphValue = Value.wrap(entityValuePtr);
  const value = data[propertyName];

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

      return new Decimal(__getString(bigDecimalStringPtr));
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

const formatEntityValue = async (instanceExports: any, subgraphValue: any, type: ColumnType, value: any, isArray: boolean): Promise<any> => {
  const { __newString, __newArray, BigInt: ExportBigInt, Value, ByteArray, Bytes, BigDecimal, id_of_type: getIdOfType } = instanceExports;

  if (isArray) {
    // TODO: Implement handling array of Bytes type field.
    const dataArrayPromises = value.map((el: any) => formatEntityValue(instanceExports, subgraphValue, type, el, false));
    const dataArray = await Promise.all(dataArrayPromises);
    const arrayStoreValueId = await getIdOfType(TypeId.ArrayStoreValue);
    const valueArray = await __newArray(arrayStoreValueId, dataArray);

    return Value.fromArray(valueArray);
  }

  switch (type) {
    case 'varchar': {
      const entityValue = await __newString(value);
      const kind = await subgraphValue.kind;

      switch (kind) {
        case ValueKind.BYTES: {
          const byteArray = await ByteArray.fromHexString(entityValue);
          const bytes = await Bytes.fromByteArray(byteArray);

          return Value.fromBytes(bytes);
        }

        default:
          return Value.fromString(entityValue);
      }
    }

    case 'integer': {
      return Value.fromI32(value);
    }

    case 'bigint': {
      const valueStringPtr = await __newString(value.toString());
      const bigInt = await ExportBigInt.fromString(valueStringPtr);

      return Value.fromBigInt(bigInt);
    }

    case 'boolean': {
      return Value.fromBoolean(value ? 1 : 0);
    }

    case 'enum': {
      const entityValue = await __newString(value);

      return Value.fromString(entityValue);
    }

    case 'numeric': {
      const valueStringPtr = await __newString(value.toString());
      const bigDecimal = await BigDecimal.fromString(valueStringPtr);

      return Value.fromBigDecimal(bigDecimal);
    }

    // TODO: Support more types.
    default:
      throw new Error(`Unsupported type: ${type}`);
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
