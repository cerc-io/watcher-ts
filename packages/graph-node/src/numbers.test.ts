//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import { expect } from 'chai';

import { instantiate } from './loader';
import { getTestDatabase } from '../test/utils';
import { Database } from './database';

const EXAMPLE_WASM_FILE_PATH = '../test/subgraph/example1/build/Example1/Example1.wasm';

describe('numbers wasm tests', () => {
  let exports: any;
  let db: Database;

  before(async () => {
    db = getTestDatabase();

    const filePath = path.resolve(__dirname, EXAMPLE_WASM_FILE_PATH);
    const instance = await instantiate(db, { event: {} }, filePath);
    exports = instance.exports;
    const { _start } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();
  });

  describe('should execute bigInt fromString API', () => {
    let testBigIntFromString: any, testBigIntWithI32: any, __getString: any, __newString: any, __getArray: any;

    before(() => {
      ({ testBigIntFromString, testBigIntWithI32, __getString, __newString, __getArray } = exports);
    });

    it('should get bigInt for positive numbers', async () => {
      const ptr = await testBigIntFromString(await __newString('923567899898'));
      expect(__getString(ptr)).to.equal('923567899898');
    });

    it('should get bigInt for negative numbers', async () => {
      const ptr = await testBigIntFromString(await __newString('-1506556'));
      expect(__getString(ptr)).to.equal('-1506556');
    });

    it('should give equal values for bigInt fromString and fromI32', async () => {
      const ptr = await testBigIntWithI32(await __newString('-1506556'));
      const ptrs = __getArray(ptr);

      expect(__getString(ptrs[0])).to.equal(__getString(ptrs[1]));
      expect(__getString(ptrs[2])).to.equal('0');
    });
  });

  it('should execute bigInt plus API', async () => {
    const { testBigIntPlus, __getString } = exports;

    const ptr = await testBigIntPlus();
    expect(__getString(ptr)).to.equal('200');
  });

  it('should execute bigInt minus API', async () => {
    const { testBigIntMinus, __getString } = exports;

    const ptr = await testBigIntMinus();
    expect(__getString(ptr)).to.equal('100');
  });

  it('should execute bigInt times API', async () => {
    const { testBigIntTimes, __getString } = exports;

    const ptr = await testBigIntTimes();
    expect(__getString(ptr)).to.equal('1000');
  });

  it('should execute bigInt dividedBy API', async () => {
    const { testBigIntDividedBy, __getString } = exports;

    const ptr = await testBigIntDividedBy();
    expect(__getString(ptr)).to.equal('100');
  });

  it('should execute bigDecimal toString API', async () => {
    const { testBigDecimalToString, __getString } = exports;

    const ptr = await testBigDecimalToString();
    expect(__getString(ptr)).to.equal('1000000000000000000');
  });

  describe('should execute bigDecimal fromString API', () => {
    let testBigDecimalFromString: any, __getString: any, __newString: any;

    before(() => {
      ({ testBigDecimalFromString, __getString, __newString } = exports);
    });

    it('should get bigDecimal for numbers without decimals', async () => {
      const ptr = await testBigDecimalFromString(await __newString('4.321e+4'));
      expect(__getString(ptr)).to.equal('43210');
    });

    it('should get bigDecimal for numbers with decimals', async () => {
      const ptr = await testBigDecimalFromString(await __newString('-5032485723458348569331745849735.3343434634691214453454356561'));
      expect(__getString(ptr)).to.equal('-5032485723458348569331745849735.3343434634691214453454356561');
    });
  });

  xit('should execute bigDecimal dividedBy API', () => {
    const { testBigDecimalDividedBy, __getString } = exports;

    const ptr = testBigDecimalDividedBy();
    expect(__getString(ptr)).to.equal('10000000000000000');
    console.log(__getString(ptr));
  });
});
