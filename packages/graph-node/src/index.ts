//
// Copyright 2021 Vulcanize, Inc.
//

import fs from 'fs/promises';
import loader from '@assemblyscript/loader';

const imports = {
  index: {
    'store.get': () => {
      console.log('store.get');
    },
    'store.set': () => {
      console.log('store.set');
    },

    'typeConversion.stringToH160': () => {
      console.log('typeConversion.stringToH160');
    },
    'typeConversion.bytesToHex': () => {
      console.log('typeConversion.bytesToHex');
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

    'log.log': () => {
      console.log('log.log');
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
    }
  }
};

export const instantiate = async (filePath: string): Promise<loader.ResultObject & { exports: any }> => {
  const buffer = await fs.readFile(filePath);
  return loader.instantiate(buffer, imports);
};
