import { BigNumber } from 'ethers';
import path from 'path';
import fs from 'fs-extra';
import debug from 'debug';
import yaml from 'js-yaml';

import { TypeId, ValueKind } from './types';

const log = debug('vulcanize:utils');

interface EventParam {
  name: string;
  value: any;
  kind: string;
}

interface Block {
  hash: string;
  number: number;
  timestamp: number;
  parentHash: string;
}

interface Transaction {
  hash: string;
  index: number;
  from: string;
  to: string;
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

  // Fill block data.
  const blockHashByteArray = await ByteArray.fromHexString(await __newString(blockData.hash));
  const blockHash = await Bytes.fromByteArray(blockHashByteArray);

  const parentHashByteArray = await ByteArray.fromHexString(await __newString(blockData.parentHash));
  const parentHash = await Bytes.fromByteArray(parentHashByteArray);

  const blockNumber = await BigInt.fromI32(blockData.number);

  const blockTimestamp = await BigInt.fromI32(blockData.timestamp);

  const block = await ethereum.Block.__new(
    blockHash,
    parentHash,
    await Bytes.empty(),
    await Address.zero(),
    await Bytes.empty(),
    await Bytes.empty(),
    await Bytes.empty(),
    blockNumber,
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    blockTimestamp,
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    null
  );

  // Fill transaction data.
  const txHashByteArray = await ByteArray.fromHexString(await __newString(tx.hash));
  const txHash = await Bytes.fromByteArray(txHashByteArray);

  const txIndex = await BigInt.fromI32(tx.index);

  const txFrom = await Address.fromString(await __newString(tx.from));

  const txTo = tx.to && await Address.fromString(await __newString(tx.to));

  const transaction = await ethereum.Transaction.__new(
    txHash,
    txIndex,
    txFrom,
    txTo,
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    await BigInt.fromI32(0),
    await Bytes.empty()
  );

  const eventParamArrayPromise = eventParamsData.map(async data => {
    const { name, value, kind } = data;

    const ethValue = await toEthereumValue(instanceExports, value, kind);

    return ethereum.EventParam.__new(
      await __newString(name),
      ethValue
    );
  });

  const eventParamArray = await Promise.all(eventParamArrayPromise);
  const eventParams = await __newArray(await idOfType(TypeId.ArrayEventParam), eventParamArray);

  const addStrPtr = await __newString(contractAddress);

  // Create event to be passed to handler.
  return ethereum.Event.__new(
    await Address.fromString(addStrPtr),
    await BigInt.fromI32(eventIndex),
    await BigInt.fromI32(0),
    null,
    block,
    transaction,
    eventParams
  );
};

export const getSubgraphConfig = async (subgraphPath: string): Promise<any> => {
  const configFilePath = path.resolve(path.join(subgraphPath, 'subgraph.yaml'));
  const fileExists = await fs.pathExists(configFilePath);

  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const config = yaml.load(await fs.readFile(configFilePath, 'utf8'));
  log('config', JSON.stringify(config, null, 2));

  return config;
};
