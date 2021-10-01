//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs/promises';
import loader from '@assemblyscript/loader';
import {
  utils,
  BigNumber
  // getDefaultProvider,
  // Contract
} from 'ethers';
import { instantiate as asyncInstantiate } from 'asyncify-wasm';

import { TypeId } from './types';
// import exampleAbi from '../test/subgraph/example1/build/Example1/abis/Example1.json';

// const NETWORK_URL = 'http://127.0.0.1:8545';

type idOfType = (TypeId: number) => number

export const instantiate = async (filePath: string): Promise<WebAssembly.Instance> => {
  const buffer = await fs.readFile(filePath);
  // const provider = getDefaultProvider(NETWORK_URL);

  const imports = {
    index: {
      'store.get': () => {
        console.log('store.get');
      },
      'store.set': () => {
        console.log('store.set');
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
        console.log('log.log', msg);
        // console.log('console.log', __getString(msg));
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
      'ethereum.call': (call: number) => {
        const smartContractCall = ethereum.SmartContractCall.wrap(call);

        const contractAddress = Address.wrap(smartContractCall.contractAddress);
        const contractName = __getString(smartContractCall.contractName);
        const functionName = __getString(smartContractCall.functionName);
        const functionSignature = __getString(smartContractCall.functionSignature);
        const functionParams = __getArray(smartContractCall.functionParams);
        console.log('ethereum.call params', __getString(contractAddress.toHexString()), contractName, functionName, functionSignature, functionParams);

        // TODO: Get ABI according to contractName.
        // const contract = new Contract(__getString(contractAddress.toHexString()), exampleAbi, provider);

        try {
          // TODO: Implement async function to perform eth_call.
          // let result = await contract[functionName](...functionParams);
          let result: any = 'test';

          if (!Array.isArray(result)) {
            result = [result];
          }

          const resultPtrArray = result.map((value: any) => {
            // TODO: Create Value instance according to type.
            const ethValue = ethereum.Value.fromString(__newString(value));

            return ethValue;
          });

          const res = __newArray(getIdOfType(TypeId.ArrayEthereumValue), resultPtrArray);

          return res;
        } catch (err) {
          console.log('eth_call error', err);
          return null;
        }
      }
    },
    conversion: {
      'typeConversion.stringToH160': (s: number) => {
        const string = __getString(s);
        const address = utils.getAddress(string);
        const byteArray = utils.arrayify(address);

        const uint8ArrayId = getIdOfType(TypeId.Uint8Array);
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

      'typeConversion.bytesToHex': (bytes: number) => {
        const byteArray = __getArray(bytes);
        const hexString = utils.hexlify(byteArray);
        const ptr = __newString(hexString);

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
      'bigDecimal.dividedBy': (x: number, y: number) => {
        console.log('numbers bigDecimal.dividedBy');

        const bigDecimaly = BigDecimal.wrap(y);

        const yDigitsBigIntArray = __getArray(bigDecimaly.digits);
        const yDigits = BigNumber.from(yDigitsBigIntArray);

        const yExpBigIntArray = __getArray(bigDecimaly.exp);
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

      'bigInt.fromString': (s: number) => {
        const string = __getString(s);
        const bigNumber = BigNumber.from(string);
        const hex = bigNumber.toHexString();
        const bytes = utils.arrayify(hex);

        const uint8ArrayId = getIdOfType(TypeId.Uint8Array);
        const ptr = __newArray(uint8ArrayId, bytes);
        const bigInt = BigInt.fromSignedBytes(ptr);

        return bigInt;
      },
      'bigInt.plus': (x: number, y: number) => {
        const xBigIntArray = __getArray(x);
        const xBigNumber = BigNumber.from(xBigIntArray);

        const yBigIntArray = __getArray(y);
        const yBigNumber = BigNumber.from(yBigIntArray);

        const sum = xBigNumber.add(yBigNumber);
        const ptr = __newString(sum.toString());
        const sumBigInt = BigInt.fromString(ptr);

        return sumBigInt;
      },
      'bigInt.minus': (x: number, y: number) => {
        const xBigIntArray = __getArray(x);
        const xBigNumber = BigNumber.from(xBigIntArray);

        const yBigIntArray = __getArray(y);
        const yBigNumber = BigNumber.from(yBigIntArray);

        const diff = xBigNumber.sub(yBigNumber);
        const ptr = __newString(diff.toString());
        const sumBigInt = BigInt.fromString(ptr);

        return sumBigInt;
      },
      'bigInt.dividedBy': () => {
        console.log('bigInt.dividedBy');
      },
      'bigInt.times': () => {
        console.log('bigInt.times');
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
    env: {
      abort: () => {
        console.log('env.abort');
      }
    }
  };

  const { module, exports } = await loader.instantiate(buffer, imports);

  const instance = await asyncInstantiate(module, imports);

  const { __getString, __newString, __getArray, __newArray } = exports;

  const getIdOfType: idOfType = exports.id_of_type as idOfType;
  const BigDecimal: any = exports.BigDecimal as any;
  const BigInt: any = exports.BigInt as any;
  const Address: any = exports.Address as any;
  const ethereum: any = exports.ethereum as any;

  return instance;
};
