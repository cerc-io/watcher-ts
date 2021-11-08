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
    db = await getTestDatabase();

    const filePath = path.resolve(__dirname, EXAMPLE_WASM_FILE_PATH);
    const instance = await instantiate(db, { event: {} }, filePath);
    exports = instance.exports;
    const { _start } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();
  });

  it('should execute bigInt fromString API', async () => {
    const { testBigIntFromString, __getString } = exports;

    const ptr = await testBigIntFromString();
    expect(__getString(ptr)).to.equal('123');
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

  xit('should execute bigDecimal dividedBy API', () => {
    const { testBigDecimalDividedBy, __getString } = exports;

    const ptr = testBigDecimalDividedBy();
    expect(__getString(ptr)).to.equal('10000000000000000');
    console.log(__getString(ptr));
  });
});
