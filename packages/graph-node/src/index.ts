//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs/promises';
import loader from '@assemblyscript/loader';
import { utils } from 'ethers';

export const instantiate = async (filePath: string): Promise<loader.ResultObject & { exports: any }> => {
  const buffer = await fs.readFile(filePath);

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
        console.log('typeConversion.bigIntToString');
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
        console.log('console.log', __getString(msg));
      },

      // 'dataSource.create': () => {
      //   console.log('dataSource.create');
      // },
      'dataSource.address': () => {
        console.log('dataSource.address');
      }
    },
    ethereum: {
      'ethereum.call': () => {
        console.log('ethereum.call');
        return null;
      }
    },
    conversion: {
      'typeConversion.stringToH160': () => {
        console.log('conversion typeConversion.stringToH160');
      },

      'typeConversion.bytesToHex': (bytes: number) => {
        console.log('conversion typeConversion.bytesToHex');
        const byteArray = __getArray(bytes);
        const hexString = utils.hexlify(byteArray);
        const ptr = __newString(hexString);
        return ptr;
      }
    }
  };

  const instance = await loader.instantiate(buffer, imports);

  const exports = instance.exports;
  const { __getString, __newString, __getArray } = exports;

  return instance;
};
