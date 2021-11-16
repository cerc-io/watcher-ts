//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import fs from 'fs/promises';
import loader from '@vulcanize/assemblyscript/lib/loader';
import {
  utils,
  BigNumber,
  getDefaultProvider,
  Contract,
  ContractInterface
} from 'ethers';
import Decimal from 'decimal.js';
import JSONbig from 'json-bigint';

import { IndexerInterface } from '@vulcanize/util';

import { TypeId } from './types';
import { Block, fromEthereumValue, toEthereumValue } from './utils';
import { Database } from './database';

const NETWORK_URL = 'http://127.0.0.1:8081';

type idOfType = (TypeId: number) => number

interface DataSource {
  address: string
}

interface GraphData {
  abis?: {[key: string]: ContractInterface};
  dataSource?: DataSource;
}

export interface Context {
  event: {
    block?: Block
  }
}

export const instantiate = async (database: Database, indexer: IndexerInterface, context: Context, filePath: string, data: GraphData = {}): Promise<loader.ResultObject & { exports: any }> => {
  const { abis = {}, dataSource } = data;
  const buffer = await fs.readFile(filePath);
  const provider = getDefaultProvider(NETWORK_URL);

  const imports: WebAssembly.Imports = {
    index: {
      'store.get': async (entity: number, id: number) => {
        const entityName = __getString(entity);
        const entityId = __getString(id);

        assert(context.event.block);
        const entityData = await database.getEntity(entityName, entityId, context.event.block.blockHash);

        if (!entityData) {
          return null;
        }

        return database.toGraphEntity(exports, entityName, entityData);
      },
      'store.set': async (entity: number, id: number, data: number) => {
        const entityName = __getString(entity);

        const entityInstance = await Entity.wrap(data);

        assert(context.event.block);
        const dbData = await database.fromGraphEntity(exports, context.event.block, entityName, entityInstance);
        await database.saveEntity(entityName, dbData);

        // Remove blockNumber and blockHash from dbData for auto-diff.
        delete dbData.blockNumber;
        delete dbData.blockHash;

        // Prepare the diff data.
        const diffData: any = { state: {} };
        // JSON stringify and parse data for handling unknown types when encoding.
        // For example, decimal.js values are converted to string in the diff data.
        diffData.state[entityName] = JSONbig.parse(JSONbig.stringify(dbData));

        // Create an auto-diff.
        assert(indexer.createDiffStaged);
        assert(dataSource?.address);
        await indexer.createDiffStaged(dataSource.address, context.event.block.blockHash, diffData);
      },

      'log.log': (_: number, msg: number) => {
        console.log('log.log', __getString(msg));
      },

      'test.asyncMethod': async () => {
        console.log('before timer start');
        await new Promise(resolve => {
          setTimeout(() => {
            resolve(1);
          }, 3000);
        });
        console.log('after timer complete');

        return 123;
      }
    },
    ethereum: {
      'ethereum.call': async (call: number) => {
        const smartContractCall = await ethereum.SmartContractCall.wrap(call);

        const contractAddress = await Address.wrap(await smartContractCall.contractAddress);
        const contractName = __getString(await smartContractCall.contractName);
        const functionName = __getString(await smartContractCall.functionName);
        const functionSignature = __getString(await smartContractCall.functionSignature);
        let functionParams = __getArray(await smartContractCall.functionParams);

        console.log('ethereum.call params');
        console.log('functionSignature:', functionSignature);

        const abi = abis[contractName];
        const contract = new Contract(__getString(await contractAddress.toHexString()), abi, provider);

        try {
          const functionParamsPromise = functionParams.map(async param => {
            const ethereumValue = await ethereum.Value.wrap(param);
            return fromEthereumValue(exports, ethereumValue);
          });

          functionParams = await Promise.all(functionParamsPromise);

          // TODO: Check for function overloading.
          let result = await contract[functionName](...functionParams);

          if (!Array.isArray(result)) {
            result = [result];
          }

          // TODO: Check for function overloading.
          // Using function signature does not work.
          const outputs = contract.interface.getFunction(functionName).outputs;

          const resultPtrArrayPromise = result.map(async (value: any, index: number) => {
            assert(outputs);
            return toEthereumValue(exports, value, outputs[index].type);
          });

          const resultPtrArray: any[] = await Promise.all(resultPtrArrayPromise);
          const res = await __newArray(await getIdOfType(TypeId.ArrayEthereumValue), resultPtrArray);

          return res;
        } catch (err) {
          console.log('eth_call error', err);
          return null;
        }
      }
    },
    conversion: {
      'typeConversion.stringToH160': async (s: number) => {
        const string = __getString(s);
        const address = utils.getAddress(string);
        const byteArray = utils.arrayify(address);

        const uint8ArrayId = await getIdOfType(TypeId.Uint8Array);
        const ptr = __newArray(uint8ArrayId, byteArray);

        return ptr;
      },

      'typeConversion.bigIntToString': (bigInt: number) => {
        const bigIntByteArray = __getArray(bigInt);
        const bigNumber = BigNumber.from(bigIntByteArray);
        const ptr = __newString(bigNumber.toString());

        return ptr;
      },
      'typeConversion.bigIntToHex': () => {
        console.log('index typeConversion.bigIntToHex');
      },

      'typeConversion.bytesToHex': async (bytes: number) => {
        const byteArray = __getArray(bytes);
        const hexString = utils.hexlify(byteArray);
        const ptr = await __newString(hexString);

        return ptr;
      },
      'typeConversion.bytesToString': () => {
        console.log('index typeConversion.bytesToString');
      },
      'typeConversion.bytesToBase58': () => {
        console.log('index typeConversion.bytesToBase58');
      }
    },
    numbers: {
      'bigDecimal.dividedBy': async (x: number, y: number) => {
        console.log('numbers bigDecimal.dividedBy');

        const bigDecimaly = BigDecimal.wrap(y);

        const yDigitsBigIntArray = __getArray(await bigDecimaly.digits);
        const yDigits = BigNumber.from(yDigitsBigIntArray);

        const yExpBigIntArray = __getArray(await bigDecimaly.exp);
        const yExp = BigNumber.from(yExpBigIntArray);

        console.log('y digits and exp', yDigits, yExp);
      },
      'bigDecimal.toString': async (bigDecimal: number) => {
        const bigDecimalInstance = BigDecimal.wrap(bigDecimal);

        const digitsBigInt = BigInt.wrap(await bigDecimalInstance.digits);
        const expBigInt = BigInt.wrap(await bigDecimalInstance.exp);

        const digits = __getString(await digitsBigInt.toString());
        const exp = __getString(await expBigInt.toString());

        const decimal = new Decimal(`${digits}e${exp}`);
        const ptr = __newString(decimal.toFixed());

        return ptr;
      },
      'bigDecimal.fromString': async (s: number) => {
        const string = __getString(s);
        const decimal = new Decimal(string);

        // Convert from digits array to BigInt.
        const digits = decimal.d.join('');
        const digitsBigNumber = BigNumber.from(digits);
        const signBigNumber = BigNumber.from(decimal.s);
        const digitsBigInt = await BigInt.fromString(await __newString(digitsBigNumber.mul(signBigNumber).toString()));

        // Calculate exp after converting digits to BigInt above.
        const exp = decimal.e - digits.length + 1;
        const expBigInt = await BigInt.fromString(await __newString(exp.toString()));

        const bigDecimal = await BigDecimal.__new(digitsBigInt);
        bigDecimal.exp = expBigInt;

        return bigDecimal;
      },
      'bigDecimal.plus': () => {
        console.log('bigDecimal.plus');
      },
      'bigDecimal.minus': () => {
        console.log('bigDecimal.minus');
      },
      'bigDecimal.times': () => {
        console.log('bigDecimal.times');
      },

      'bigInt.fromString': async (s: number) => {
        const string = __getString(s);
        const bigNumber = BigNumber.from(string);
        const hex = bigNumber.toHexString();
        const bytes = utils.arrayify(hex);

        const uint8ArrayId = await getIdOfType(TypeId.Uint8Array);
        const ptr = await __newArray(uint8ArrayId, bytes);
        const bigInt = await BigInt.fromSignedBytes(ptr);

        return bigInt;
      },
      'bigInt.plus': async (x: number, y: number) => {
        const xBigInt = await BigInt.wrap(x);
        const xBigNumber = BigNumber.from(__getString(await xBigInt.toString()));

        const yBigInt = await BigInt.wrap(y);
        const yBigNumber = BigNumber.from(__getString(await yBigInt.toString()));

        const sum = xBigNumber.add(yBigNumber);
        const ptr = await __newString(sum.toString());
        const sumBigInt = await BigInt.fromString(ptr);

        return sumBigInt;
      },
      'bigInt.minus': async (x: number, y: number) => {
        const xBigInt = await BigInt.wrap(x);
        const xBigNumber = BigNumber.from(__getString(await xBigInt.toString()));

        const yBigInt = await BigInt.wrap(y);
        const yBigNumber = BigNumber.from(__getString(await yBigInt.toString()));

        const diff = xBigNumber.sub(yBigNumber);
        const ptr = await __newString(diff.toString());
        const diffBigInt = BigInt.fromString(ptr);

        return diffBigInt;
      },
      'bigInt.times': async (x: number, y: number) => {
        const xBigInt = await BigInt.wrap(x);
        const xBigNumber = BigNumber.from(__getString(await xBigInt.toString()));

        const yBigInt = await BigInt.wrap(y);
        const yBigNumber = BigNumber.from(__getString(await yBigInt.toString()));

        const product = xBigNumber.mul(yBigNumber);
        const ptr = await __newString(product.toString());
        const productBigInt = BigInt.fromString(ptr);

        return productBigInt;
      },
      'bigInt.dividedBy': async (x: number, y: number) => {
        const xBigInt = await BigInt.wrap(x);
        const xBigNumber = BigNumber.from(__getString(await xBigInt.toString()));

        const yBigInt = await BigInt.wrap(y);
        const yBigNumber = BigNumber.from(__getString(await yBigInt.toString()));

        const quotient = xBigNumber.div(yBigNumber);
        const ptr = await __newString(quotient.toString());
        const quotientBigInt = BigInt.fromString(ptr);

        return quotientBigInt;
      },
      'bigInt.dividedByDecimal': () => {
        console.log('bigInt.dividedByDecimal');
      },
      'bigInt.mod': () => {
        console.log('bigInt.mod');
      },
      'bigInt.bitOr': () => {
        console.log('bigInt.bitOr');
      },
      'bigInt.bitAnd': () => {
        console.log('bigInt.bitAnd');
      },
      'bigInt.leftShift': () => {
        console.log('bigInt.leftShift');
      },
      'bigInt.rightShift': () => {
        console.log('bigInt.rightShift');
      },
      'bigInt.pow': () => {
        console.log('bigInt.pow');
      }
    },
    datasource: {
      'dataSource.address': async () => {
        assert(dataSource);
        return Address.fromString(await __newString(dataSource.address));
      }
    }
  };

  const instance = await loader.instantiate(buffer, imports);
  const { exports } = instance;

  const { __getString, __newString, __getArray, __newArray } = exports;

  // TODO: Assign from types file generated by graph-cli
  const getIdOfType: idOfType = exports.id_of_type as idOfType;
  const BigDecimal: any = exports.BigDecimal as any;
  const BigInt: any = exports.BigInt as any;
  const Address: any = exports.Address as any;
  const ethereum: any = exports.ethereum as any;
  const Entity: any = exports.Entity as any;

  return instance;
};
