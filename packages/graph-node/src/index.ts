//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import fs from 'fs/promises';
import loader from 'assemblyscript/lib/loader';
import {
  utils,
  BigNumber,
  getDefaultProvider,
  Contract,
  ContractInterface
} from 'ethers';

import { TypeId } from './types';
import { fromEthereumValue, toEthereumValue } from './utils';

const NETWORK_URL = 'http://127.0.0.1:8081';

type idOfType = (TypeId: number) => number

interface DataSource {
  address: string
}

interface GraphData {
  abis?: {[key: string]: ContractInterface};
  dataSource?: DataSource;
}

export const instantiate = async (filePath: string, data: GraphData = {}): Promise<loader.ResultObject & { exports: any }> => {
  const { abis = {}, dataSource } = data;
  const buffer = await fs.readFile(filePath);
  const provider = getDefaultProvider(NETWORK_URL);

  const imports: WebAssembly.Imports = {
    index: {
      'store.get': async (entity: number, id: number) => {
        console.log('store.get');

        const entityString = __getString(entity);
        console.log('entity:', entityString);
        const idString = __getString(id);
        console.log('id:', idString);

        // TODO: Implement store get to fetch from DB using entity and id.

        // TODO: Fill entity with field values.
        // return Entity.__new()
        return null;
      },
      'store.set': async (entity: number, id: number, data: number) => {
        console.log('store.set');

        const entityString = __getString(entity);
        console.log('entity:', entityString);
        const idString = __getString(id);
        console.log('id:', idString);
        const entityInstance = await Entity.wrap(data);
        const entityInstanceId = __getString(await entityInstance.getString(await __newString('id')));
        console.log('entity instance id:', entityInstanceId);

        // TODO: Implement store set to save entity in db with values from entityInstance.
      },

      'typeConversion.stringToH160': () => {
        console.log('index typeConversion.stringToH160');
      },
      'typeConversion.bytesToHex': () => {
        console.log('index typeConversion.bytesToHex');
      },
      // 'typeConversion.bytesToString': () => {
      //   console.log('typeConversion.bytesToString');
      // },
      'typeConversion.bigIntToString': () => {
        console.log('index typeConversion.bigIntToString');
      },

      // 'bigDecimal.fromString': () => {
      //   console.log('bigDecimal.fromString');
      // },
      // 'bigDecimal.times': () => {
      //   console.log('bigDecimal.times');
      // },
      'bigDecimal.dividedBy': () => {
        console.log('bigDecimal.dividedBy');
      },
      // 'bigDecimal.plus': () => {
      //   console.log('bigDecimal.plus');
      // },
      // 'bigDecimal.minus': () => {
      //   console.log('bigDecimal.minus');
      // },

      'bigInt.plus': () => {
        console.log('bigInt.plus');
      },
      'bigInt.minus': () => {
        console.log('bigInt.minus');
      },
      'bigInt.times': () => {
        console.log('bigInt.times');
      },
      'bigInt.dividedBy': () => {
        console.log('bigInt.dividedBy');
      },
      // 'bigInt.mod': () => {
      //   console.log('bigInt.mod');
      // },
      'bigInt.fromString': () => {
        console.log('bigInt.fromString');
      },

      'log.log': (_: number, msg: number) => {
        console.log('log.log', __getString(msg));
      },

      // 'dataSource.create': () => {
      //   console.log('dataSource.create');
      // },
      'dataSource.address': () => {
        console.log('dataSource.address');
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
        // console.log('bigIntByteArray', bigIntByteArray)
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
      'bigDecimal.toString': () => {
        console.log('numbers bigDecimal.toString');
      },
      'bigDecimal.fromString': () => {
        console.log('numbers bigDecimal.toString');
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
