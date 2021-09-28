//
// Copyright 2021 Vulcanize, Inc.
//

import path from 'path';
import { expect } from 'chai';

import { instantiate } from './index';

const EXAMPLE_WASM_FILE_PATH = '../test/subgraph/example1/build/Example1/Example1.wasm';

describe('typeConversion wasm tests', () => {
  let exports: any;

  before(async () => {
    const filePath = path.resolve(__dirname, EXAMPLE_WASM_FILE_PATH);
    const instance = await instantiate(filePath);
    exports = instance.exports;
    const { _start } = exports;

    // Important to call _start for built subgraphs on instantiation!
    // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
    _start();
  });

  it('should execute typeConversion bytesToHex API', () => {
    const { testBytesToHex, __getString } = exports;

    const ptr = testBytesToHex();
    expect(__getString(ptr)).to.equal('0x231a');
  });

  it('should execute typeConversion bigIntToString API', () => {
    const { testBigIntToString, __getString } = exports;

    const ptr = testBigIntToString();
    expect(__getString(ptr)).to.equal('8986');
  });

  it('should execute typeConversion stringToH160 API', () => {
    const { testStringToH160, __getString } = exports;

    const ptr = testStringToH160();
    // TODO: Fix result string converted to lower case.
    // Actual value: 0xafAd925B5eAE1E370196cBa39893E858ff7257d5
    expect(__getString(ptr)).to.equal('0xafad925b5eae1e370196cba39893e858ff7257d5');
  });
});
