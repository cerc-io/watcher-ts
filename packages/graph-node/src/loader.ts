//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import fs from 'fs/promises';
import {
  utils,
  BigNumber,
  getDefaultProvider,
  Contract,
  ContractInterface
} from 'ethers';
import JSONbig from 'json-bigint';
import BN from 'bn.js';
import debug from 'debug';

import loader from '@vulcanize/assemblyscript/lib/loader';
import { IndexerInterface, GraphDecimal, getGraphDigitsAndExp } from '@vulcanize/util';

import { TypeId, Level } from './types';
import {
  Block,
  fromEthereumValue,
  toEthereumValue,
  resolveEntityFieldConflicts
} from './utils';
import { Database } from './database';

const NETWORK_URL = 'http://127.0.0.1:8081';

// Endianness of BN used in bigInt store host API.
// Negative bigInt is being stored in wasm in 2's compliment, 'le' representation.
// (for eg. bigInt.fromString(negativeI32Value))
const BN_ENDIANNESS = 'le';

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

const log = debug('vulcanize:graph-node');

export const instantiate = async (
  database: Database,
  indexer: IndexerInterface,
  context: Context,
  filePath: string,
  data: GraphData = {}
): Promise<loader.ResultObject & { exports: any }> => {
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

        return database.toGraphEntity(instanceExports, entityName, entityData);
      },
      'store.set': async (entity: number, id: number, data: number) => {
        const entityName = __getString(entity);

        const entityInstance = await Entity.wrap(data);

        assert(context.event.block);
        let dbData = await database.fromGraphEntity(instanceExports, context.event.block, entityName, entityInstance);
        await database.saveEntity(entityName, dbData);

        // Resolve any field name conflicts in the dbData for auto-diff.
        dbData = resolveEntityFieldConflicts(dbData);

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

      'log.log': (level: number, msg: number) => {
        log('log %s | %s', Level[level], __getString(msg));
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

        const contractAddressPtr = await smartContractCall.contractAddress;
        const contractAddress = await Address.wrap(contractAddressPtr);

        const contractNamePtr = await smartContractCall.contractName;
        const contractName = __getString(contractNamePtr);

        const functionNamePtr = await smartContractCall.functionName;
        const functionName = __getString(functionNamePtr);

        const functionSignaturePtr = await smartContractCall.functionSignature;
        const functionSignature = __getString(functionSignaturePtr);

        const functionParamsPtr = await smartContractCall.functionParams;
        let functionParams = __getArray(functionParamsPtr);

        console.log('ethereum.call params');
        console.log('functionSignature:', functionSignature);

        const abi = abis[contractName];
        const contractAddressStringPtr = await contractAddress.toHexString();
        const contract = new Contract(__getString(contractAddressStringPtr), abi, provider);

        try {
          const functionParamsPromise = functionParams.map(async param => {
            const ethereumValue = await ethereum.Value.wrap(param);
            return fromEthereumValue(instanceExports, ethereumValue);
          });

          functionParams = await Promise.all(functionParamsPromise);

          // TODO: Check for function overloading.
          let result = await contract[functionName](...functionParams);

          // Using function signature does not work.
          const { outputs } = contract.interface.getFunction(functionName);
          assert(outputs);

          // If method returns a single value, ethers returns it directly compared to returning multiple values in an array.
          if (outputs.length === 1) {
            // Put result in an array to map with the outputs array from abi.
            result = [result];
          }

          const resultPtrArrayPromise = outputs.map(
            async (
              output: any,
              index: number
            ) => toEthereumValue(
              instanceExports,
              output,
              result[index]
            )
          );

          const resultPtrArray: any[] = await Promise.all(resultPtrArrayPromise);
          const arrayEthereumValueId = await getIdOfType(TypeId.ArrayEthereumValue);
          const res = await __newArray(arrayEthereumValueId, resultPtrArray);

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

        // Create a BN with 'le' endianness.
        const bigNumber = new BN(bigIntByteArray, BN_ENDIANNESS);

        // Convert BN from two's compliment and to string.
        const bigNumberString = bigNumber.fromTwos(bigIntByteArray.length * 8).toString();

        const ptr = __newString(bigNumberString);

        return ptr;
      },
      'typeConversion.bigIntToHex': async (bigInt: number) => {
        const bigIntInstance = await BigInt.wrap(bigInt);
        const bigIntString = await bigIntInstance.toString();

        const bigNumber = BigNumber.from(__getString(bigIntString));
        const bigNumberHex = bigNumber.toHexString();

        return __newString(bigNumberHex);
      },

      'typeConversion.bytesToHex': async (bytes: number) => {
        const byteArray = __getArray(bytes);
        const hexString = utils.hexlify(byteArray);
        const ptr = await __newString(hexString);

        return ptr;
      },
      'typeConversion.bytesToString': async (bytes: number) => {
        const byteArray = __getArray(bytes);
        const string = utils.toUtf8String(byteArray);
        const ptr = await __newString(string);

        return ptr;
      },
      'typeConversion.bytesToBase58': async (n: number) => {
        const uint8Array = __getArray(n);
        const string = utils.base58.encode(uint8Array);
        const ptr = await __newString(string);

        return ptr;
      }
    },
    numbers: {
      'bigDecimal.dividedBy': async (x: number, y: number) => {
        // Creating decimal x.
        const xBigDecimal = await BigDecimal.wrap(x);
        const xStringPtr = await xBigDecimal.toString();
        const xDecimalString = __getString(xStringPtr);
        const xDecimal = new GraphDecimal(xDecimalString);

        // Create decimal y.
        const yBigDecimal = await BigDecimal.wrap(y);
        const yStringPtr = await yBigDecimal.toString();
        const yDecimalString = __getString(yStringPtr);

        // Performing the decimal division operation.
        const divResult = xDecimal.dividedBy(yDecimalString);
        const ptr = await __newString(divResult.toString());
        const divResultBigDecimal = await BigDecimal.fromString(ptr);

        return divResultBigDecimal;
      },
      'bigDecimal.toString': async (bigDecimal: number) => {
        const bigDecimalInstance = BigDecimal.wrap(bigDecimal);

        const digitsPtr = await bigDecimalInstance.digits;
        const digitsBigInt = BigInt.wrap(digitsPtr);

        const expPtr = await bigDecimalInstance.exp;
        const expBigInt = BigInt.wrap(expPtr);

        const digitsStringPtr = await digitsBigInt.toString();
        const digits = __getString(digitsStringPtr);

        const expStringPtr = await expBigInt.toString();
        const exp = __getString(expStringPtr);

        const decimal = new GraphDecimal(`${digits}e${exp}`);
        const ptr = __newString(decimal.toFixed());

        return ptr;
      },
      'bigDecimal.fromString': async (s: number) => {
        const string = __getString(s);

        // Creating a decimal using custom decimal implementation.
        const decimal = new GraphDecimal(string);

        // Get digits string and exp using decimal 'd' and 'e' properties.
        const { digits, exp } = getGraphDigitsAndExp(decimal.value.d, decimal.value.e);

        // Create a digits BigInt using digits string and decimal sign 's' property.
        const digitsBigNumber = BigNumber.from(digits);
        const signBigNumber = BigNumber.from(decimal.value.s);
        const digitsStringPtr = await __newString(digitsBigNumber.mul(signBigNumber).toString());
        const digitsBigInt = await BigInt.fromString(digitsStringPtr);

        // Create an exp BigInt.
        const expStringPtr = await __newString(exp.toString());
        const expBigInt = await BigInt.fromString(expStringPtr);

        // Create a BigDecimal using digits and exp BigInts.
        const bigDecimal = await BigDecimal.__new(digitsBigInt);
        bigDecimal.exp = expBigInt;

        return bigDecimal;
      },
      'bigDecimal.plus': async (x: number, y: number) => {
        // Create decimal x string.
        const xBigDecimal = await BigDecimal.wrap(x);
        const xStringPtr = await xBigDecimal.toString();
        const xDecimalString = __getString(xStringPtr);
        const xDecimal = new GraphDecimal(xDecimalString);

        // Create decimal y string.
        const yBigDecimal = await BigDecimal.wrap(y);
        const yStringPtr = await yBigDecimal.toString();
        const yDecimalString = __getString(yStringPtr);

        // Perform the decimal plus operation.
        const sumResult = xDecimal.plus(yDecimalString);
        const ptr = await __newString(sumResult.toString());
        const sumResultBigDecimal = await BigDecimal.fromString(ptr);

        return sumResultBigDecimal;
      },
      'bigDecimal.minus': async (x: number, y: number) => {
        // Create decimal x string.
        const xBigDecimal = await BigDecimal.wrap(x);
        const xStringPtr = await xBigDecimal.toString();
        const xDecimalString = __getString(xStringPtr);
        const xDecimal = new GraphDecimal(xDecimalString);

        // Create decimal y string.
        const yBigDecimal = await BigDecimal.wrap(y);
        const yStringPtr = await yBigDecimal.toString();
        const yDecimalString = __getString(yStringPtr);

        // Perform the decimal minus operation.
        const subResult = xDecimal.minus(yDecimalString);
        const ptr = await __newString(subResult.toString());
        const subResultBigDecimal = await BigDecimal.fromString(ptr);

        return subResultBigDecimal;
      },
      'bigDecimal.times': async (x: number, y: number) => {
        // Create decimal x string.
        const xBigDecimal = await BigDecimal.wrap(x);
        const xStringPtr = await xBigDecimal.toString();
        const xDecimalString = __getString(xStringPtr);
        const xDecimal = new GraphDecimal(xDecimalString);

        // Create decimal y string.
        const yBigDecimal = await BigDecimal.wrap(y);
        const yStringPtr = await yBigDecimal.toString();
        const yDecimalString = __getString(yStringPtr);

        // Perform the decimal times operation.
        const mulResult = xDecimal.times(yDecimalString);
        const ptr = await __newString(mulResult.toString());
        const mulResultBigDecimal = await BigDecimal.fromString(ptr);

        return mulResultBigDecimal;
      },

      'bigInt.fromString': async (s: number) => {
        const string = __getString(s);

        // The BN is being stored as a byte array in wasm memory in 2's compliment representation and interpreted as such in other APIs.
        // Create a BN in 2's compliment representation.
        // Need to use BN as ethers.BigNumber:
        //    Doesn't store -ve numbers in 2's compilment form
        //    Stores in big endian form.
        let bigNumber = new BN(string);

        // Size (in bytes) of the BN stored.
        // Add an extra byte to the BNs byte length to allow for 2's compiment.
        const bnSize = bigNumber.byteLength() + 1;
        bigNumber = bigNumber.toTwos(bnSize * 8);

        // Create a byte array out of BN in 'le' endianness.
        const bytes = bigNumber.toArray(BN_ENDIANNESS, bnSize);

        const uint8ArrayId = await getIdOfType(TypeId.Uint8Array);
        const ptr = await __newArray(uint8ArrayId, bytes);
        const bigInt = await BigInt.fromSignedBytes(ptr);

        return bigInt;
      },
      'bigInt.plus': async (x: number, y: number) => {
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xBigNumber = BigNumber.from(__getString(xStringPtr));

        const yBigInt = await BigInt.wrap(y);
        const yStringPtr = await yBigInt.toString();
        const yBigNumber = BigNumber.from(__getString(yStringPtr));

        const sum = xBigNumber.add(yBigNumber);
        const ptr = await __newString(sum.toString());
        const sumBigInt = await BigInt.fromString(ptr);

        return sumBigInt;
      },
      'bigInt.minus': async (x: number, y: number) => {
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xBigNumber = BigNumber.from(__getString(xStringPtr));

        const yBigInt = await BigInt.wrap(y);
        const yStringPtr = await yBigInt.toString();
        const yBigNumber = BigNumber.from(__getString(yStringPtr));

        const diff = xBigNumber.sub(yBigNumber);
        const ptr = await __newString(diff.toString());
        const diffBigInt = BigInt.fromString(ptr);

        return diffBigInt;
      },
      'bigInt.times': async (x: number, y: number) => {
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xBigNumber = BigNumber.from(__getString(xStringPtr));

        const yBigInt = await BigInt.wrap(y);
        const yStringPtr = await yBigInt.toString();
        const yBigNumber = BigNumber.from(__getString(yStringPtr));

        const product = xBigNumber.mul(yBigNumber);
        const ptr = await __newString(product.toString());
        const productBigInt = BigInt.fromString(ptr);

        return productBigInt;
      },
      'bigInt.dividedBy': async (x: number, y: number) => {
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xBigNumber = BigNumber.from(__getString(xStringPtr));

        const yBigInt = await BigInt.wrap(y);
        const yStringPtr = await yBigInt.toString();
        const yBigNumber = BigNumber.from(__getString(yStringPtr));

        const quotient = xBigNumber.div(yBigNumber);
        const ptr = await __newString(quotient.toString());
        const quotientBigInt = BigInt.fromString(ptr);

        return quotientBigInt;
      },
      'bigInt.dividedByDecimal': async (x: number, y: number) => {
        // Create a decimal out of bigInt x.
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xDecimal = new GraphDecimal(__getString(xStringPtr));

        // Create decimal y.
        const yBigDecimal = await BigDecimal.wrap(y);
        const yStringPtr = await yBigDecimal.toString();
        const yDecimal = new GraphDecimal(__getString(yStringPtr));

        // Perform the decimal division operation.
        const divResult = xDecimal.dividedBy(yDecimal);
        const ptr = await __newString(divResult.toString());
        const divResultBigDecimal = await BigDecimal.fromString(ptr);

        return divResultBigDecimal;
      },
      'bigInt.mod': async (x: number, y: number) => {
        // Create a bigNumber x.
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xBigNumber = BigNumber.from(__getString(xStringPtr));

        // Create a bigNumber y.
        const yBigInt = await BigInt.wrap(y);
        const yStringPtr = await yBigInt.toString();
        const yBigNumber = BigNumber.from(__getString(yStringPtr));

        // Perform the bigNumber mod operation.
        const remainder = xBigNumber.mod(yBigNumber);
        const ptr = await __newString(remainder.toString());
        const remainderBigInt = BigInt.fromString(ptr);

        return remainderBigInt;
      },
      'bigInt.bitOr': async (x: number, y: number) => {
        // Create a bigNumber x.
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xBigNumber = BigNumber.from(__getString(xStringPtr));

        // Create a bigNumber y.
        const yBigInt = await BigInt.wrap(y);
        const yStringPtr = await yBigInt.toString();
        const yBigNumber = BigNumber.from(__getString(yStringPtr));

        // Perform the bigNumber bit or operation.
        const res = xBigNumber.or(yBigNumber);
        const ptr = await __newString(res.toString());
        const resBigInt = BigInt.fromString(ptr);

        return resBigInt;
      },
      'bigInt.bitAnd': async (x: number, y: number) => {
        // Create a bigNumber x.
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xBigNumber = BigNumber.from(__getString(xStringPtr));

        // Create a bigNumber y.
        const yBigInt = await BigInt.wrap(y);
        const yStringPtr = await yBigInt.toString();
        const yBigNumber = BigNumber.from(__getString(yStringPtr));

        // Perform the bigNumber bit and operation.
        const res = xBigNumber.and(yBigNumber);
        const ptr = await __newString(res.toString());
        const resBigInt = BigInt.fromString(ptr);

        return resBigInt;
      },
      'bigInt.leftShift': async (x: number, y: number) => {
        // Create a bigNumber x.
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xBigNumber = BigNumber.from(__getString(xStringPtr));

        // Perform the bigNumber left shift operation.
        const res = xBigNumber.shl(y);
        const ptr = await __newString(res.toString());
        const resBigInt = BigInt.fromString(ptr);

        return resBigInt;
      },
      'bigInt.rightShift': async (x: number, y: number) => {
        // Create a bigNumber x.
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xBigNumber = BigNumber.from(__getString(xStringPtr));

        // Perform the bigNumber right shift operation.
        const res = xBigNumber.shr(y);
        const ptr = await __newString(res.toString());
        const resBigInt = BigInt.fromString(ptr);

        return resBigInt;
      },
      'bigInt.pow': async (x: number, y: number) => {
        // Create a bigNumber x.
        const xBigInt = await BigInt.wrap(x);
        const xStringPtr = await xBigInt.toString();
        const xBigNumber = BigNumber.from(__getString(xStringPtr));

        // Perform the bigNumber pow operation.
        const res = xBigNumber.pow(y);
        const ptr = await __newString(res.toString());
        const resBigInt = BigInt.fromString(ptr);

        return resBigInt;
      }
    },
    datasource: {
      'dataSource.address': async () => {
        assert(dataSource);
        const addressStringPtr = await __newString(dataSource.address);
        return Address.fromString(addressStringPtr);
      }
    }
  };

  const instance = await loader.instantiate(buffer, imports);
  const { exports: instanceExports } = instance;

  const { __getString, __newString, __getArray, __newArray } = instanceExports;

  // TODO: Assign from types file generated by graph-cli
  const getIdOfType: idOfType = instanceExports.id_of_type as idOfType;
  const BigDecimal: any = instanceExports.BigDecimal as any;
  const BigInt: any = instanceExports.BigInt as any;
  const Address: any = instanceExports.Address as any;
  const ethereum: any = instanceExports.ethereum as any;
  const Entity: any = instanceExports.Entity as any;

  return instance;
};
